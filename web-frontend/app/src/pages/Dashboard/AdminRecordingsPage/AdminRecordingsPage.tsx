// SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
//
// SPDX-License-Identifier: EUPL-1.2
import { Alert, IconButton, Paper, Stack, SvgIcon, Typography, styled } from '@mui/material';
import { AssetId, BaseAsset } from '@opentalk/rest-api-rtk-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useDeleteRoomAssetMutation, useGetUserOwnedAssetsQuery } from '../../../api/rest';
import { notifications, VisuallyHiddenTitle } from '../../../commonComponents';
import SuspenseLoading from '../../../commonComponents/SuspenseLoading/SuspenseLoading';
import AssetTable from '../../../components/AssetTable';
import { EditIcon } from '../../../assets/icons';
import { useAppSelector } from '../../../hooks';
import { useDownloadRoomAsset } from '../../../hooks/useDownloadRoomAsset';
import { useUpdateDocumentTitle } from '../../../hooks/useUpdateDocumentTitle';
import log from '../../../logger';
import { selectControllerUrl } from '../../../store/slices/configSlice';
import { fetchWithAuth } from '../../../utils/apiUtils';

const RECORDING_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.ogg', '.flac', '.webm', '.mp4', '.mkv'];

const isRecordingAsset = (filename: string) =>
  RECORDING_EXTENSIONS.some((extension) => filename.toLowerCase().endsWith(extension));

const LOCAL_RECORDINGS_PATH = 'PostgreSQL table: local_recordings';
const SPEAKER_ALIASES_STORAGE_KEY = 'recordingSpeakerAliases';

type LocalRecording = {
  id: string;
  filename: string;
  relativePath: string;
  size: number;
  createdAt: string;
  speakerId?: string;
  speakerName?: string | null;
  downloadUrl: string;
};

const RecordingRow = styled(Paper)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'auto auto auto 1fr',
  alignItems: 'center',
  gap: theme.spacing(1),
  padding: theme.spacing(1.5),
}));

const PlayIcon = () => (
  <SvgIcon>
    <path d="M8 5v14l11-7z" />
  </SvgIcon>
);

const PauseRecordIcon = () => (
  <SvgIcon>
    <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
  </SvgIcon>
);

const DownloadRecordIcon = () => (
  <SvgIcon>
    <path d="M5 20h14v-2H5zm7-18v10.17l3.59-3.58L17 10l-5 5-5-5 1.41-1.41L11 12.17V2z" />
  </SvgIcon>
);

const DeleteRecordIcon = () => (
  <SvgIcon>
    <path d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2h4v2H4V6h4l1-2z" />
  </SvgIcon>
);

const parseSpeakerFromFilename = (filename: string) => {
  const base = filename.replace(/\.wav$/i, '');
  const [displayNameSegment] = base.split('__');
  if (displayNameSegment && base.includes('__')) {
    const cleaned = displayNameSegment.replaceAll('_', ' ');
    if (/^unknown$/i.test(cleaned)) {
      const speakerId = getSpeakerIdFromFilename(filename);
      if (isUuidLike(speakerId)) {
        return `Participant ${speakerId.slice(0, 8)}`;
      }
    }
    return cleaned;
  }

  const [rawSpeaker] = base.split('_');
  if (!rawSpeaker) {
    return 'Unknown speaker';
  }

  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(rawSpeaker);
  if (looksLikeUuid) {
    return `Participant ${rawSpeaker.slice(0, 8)}`;
  }

  return rawSpeaker.replaceAll('-', ' ');
};

const getSpeakerIdFromFilename = (filename: string) => {
  const base = filename.replace(/\.wav$/i, '');
  if (base.includes('__')) {
    const [, idAndRest] = base.split('__');
    const [speakerId] = (idAndRest ?? '').split('_');
    return speakerId ?? '';
  }

  const [rawSpeaker] = base.split('_');
  return rawSpeaker ?? '';
};

const isUuidLike = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value);
const looksLikeMachineIdentity = (value?: string | null) => {
  if (!value) {
    return true;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return true;
  }

  if (isUuidLike(trimmed)) {
    return true;
  }

  if (/^unknown$/i.test(trimmed)) {
    return true;
  }

  return /^local-recorder-/i.test(trimmed);
};

const AdminRecordingsPage = () => {
  const heading = 'Recordings';
  useUpdateDocumentTitle(heading);
  const [localRecordings, setLocalRecordings] = useState<LocalRecording[]>([]);
  const [localError, setLocalError] = useState(false);
  const [localDeleteError, setLocalDeleteError] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [speakerAliases, setSpeakerAliases] = useState<Record<string, string>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const controllerUrl = useAppSelector(selectControllerUrl);

  const { data, isLoading, isError } = useGetUserOwnedAssetsQuery(undefined, { refetchOnMountOrArgChange: true });
  const [deleteRoomAsset] = useDeleteRoomAssetMutation();
  const downloadRoomAsset = useDownloadRoomAsset();

  const recordingAssets = useMemo(() => {
    const assets = data?.ownedAssets ?? [];
    return assets.filter((asset) => isRecordingAsset(asset.filename));
  }, [data?.ownedAssets]);

  const getRoomId = (assetId: AssetId) => recordingAssets.find((asset) => asset.id === assetId)?.roomId;

  const mapToBaseAsset = (asset: (typeof recordingAssets)[number]): BaseAsset => ({
    id: asset.id,
    filename: asset.filename,
    createdAt: asset.createdAt,
    namespace: asset.namespace,
    kind: asset.kind,
    size: asset.size,
  });

  useEffect(() => {
    const loadLocalRecordings = async () => {
      try {
        const response = await fetch('/__local-recordings');
        if (!response.ok) {
          throw new Error(`Could not load local recordings: ${response.status}`);
        }
        const payload = (await response.json()) as { recordings?: LocalRecording[] };
        setLocalRecordings(payload.recordings ?? []);
      } catch {
        setLocalError(true);
      }
    };

    loadLocalRecordings();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SPEAKER_ALIASES_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, string>;
      setSpeakerAliases(parsed);
    } catch {
      // ignore invalid local storage payloads
    }
  }, []);

  useEffect(() => {
    const resolveSpeakerNames = async () => {
      const speakerIds = Array.from(
        new Set(
          localRecordings
            .map((recording) => recording.speakerId ?? getSpeakerIdFromFilename(recording.filename))
            .filter((speakerId) => speakerId.length > 0 && isUuidLike(speakerId) && !speakerNames[speakerId])
        )
      );

      if (speakerIds.length === 0) {
        return;
      }

      const updates: Record<string, string> = {};
      await Promise.all(
        speakerIds.map(async (speakerId) => {
          try {
            const byIdResponse = await fetchWithAuth(new URL(`v1/users/${speakerId}`, controllerUrl), {
              method: 'GET',
            });
            if (byIdResponse.ok) {
              const payload = (await byIdResponse.json()) as { displayName?: string };
              if (payload.displayName) {
                updates[speakerId] = payload.displayName;
                return;
              }
            }

            // Fallback: user search endpoint
            const searchResponse = await fetchWithAuth(new URL(`v1/users/find?q=${speakerId}`, controllerUrl), {
              method: 'GET',
            });
            if (!searchResponse.ok) {
              return;
            }

            const users = (await searchResponse.json()) as Array<{ id?: string; displayName?: string }>;
            const exact = users.find((user) => user.id === speakerId);
            if (exact?.displayName) {
              updates[speakerId] = exact.displayName;
            }
          } catch {
            // keep fallback label when lookup fails
          }
        })
      );

      if (Object.keys(updates).length > 0) {
        setSpeakerNames((current) => ({ ...current, ...updates }));
      }
    };

    void resolveSpeakerNames();
  }, [controllerUrl, localRecordings, speakerNames]);

  const setAliasForSpeakerId = (speakerId: string) => {
    const current = speakerAliases[speakerId] ?? '';
    const next = window.prompt(`Set display name for ${speakerId}`, current)?.trim();
    if (!next) {
      return;
    }

    setSpeakerAliases((state) => {
      const updated = { ...state, [speakerId]: next };
      localStorage.setItem(SPEAKER_ALIASES_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  if (isLoading) {
    return <SuspenseLoading />;
  }

  return (
    <Stack spacing={3}>
      <VisuallyHiddenTitle label={heading} component="h2" />
      <Typography variant="h1" component="h2">
        {heading}
      </Typography>
      <Alert severity="info">
        Recorder storage: <strong>{LOCAL_RECORDINGS_PATH}</strong>
      </Alert>
      {localError && <Alert severity="error">Failed to load recorder files from database.</Alert>}
      {localDeleteError && <Alert severity="error">Failed to delete selected recording from database.</Alert>}
      {!localError && localRecordings.length === 0 && (
        <Alert severity="warning">No database recordings found yet.</Alert>
      )}
      {!localError && localRecordings.length > 0 && (
        <Stack spacing={1}>
          <Typography variant="h2" component="h3">
            Recorder Files
          </Typography>
          {localRecordings.map((recording) => (
            <RecordingRow key={recording.id} elevation={1}>
              <IconButton
                aria-label={playingId === recording.id ? 'Pause recording' : 'Play recording'}
                onClick={() => {
                  const audio = audioRefs.current[recording.id];
                  if (!audio) {
                    return;
                  }

                  if (playingId === recording.id) {
                    audio.pause();
                    setPlayingId(null);
                    return;
                  }

                  if (playingId && audioRefs.current[playingId]) {
                    audioRefs.current[playingId]?.pause();
                  }

                  audio.currentTime = 0;
                  void audio.play();
                  setPlayingId(recording.id);
                }}
              >
                {playingId === recording.id ? <PauseRecordIcon /> : <PlayIcon />}
              </IconButton>
              <IconButton
                aria-label="Download recording"
                component="a"
                href={recording.downloadUrl}
                download={recording.filename}
              >
                <DownloadRecordIcon />
              </IconButton>
              <IconButton
                aria-label="Delete recording"
                onClick={async () => {
                  const confirmed = window.confirm(`Delete recording "${recording.filename}"?`);
                  if (!confirmed) {
                    return;
                  }

                  try {
                    const response = await fetch(
                      `/__local-recordings/delete?id=${encodeURIComponent(recording.id)}`,
                      { method: 'DELETE' }
                    );
                    if (!response.ok) {
                      throw new Error('Delete failed');
                    }

                    setLocalRecordings((current) => current.filter((item) => item.id !== recording.id));
                    setPlayingId((current) => (current === recording.id ? null : current));
                    setLocalDeleteError(false);
                  } catch {
                    setLocalDeleteError(true);
                  }
                }}
              >
                <DeleteRecordIcon />
              </IconButton>
              <Stack spacing={0.25}>
                {(() => {
                  const speakerId = recording.speakerId ?? getSpeakerIdFromFilename(recording.filename);
                  const autoName = speakerNames[speakerId];
                  const aliasName = speakerAliases[speakerId];
                  const dbName = looksLikeMachineIdentity(recording.speakerName) ? undefined : recording.speakerName ?? undefined;
                  const parsedName = parseSpeakerFromFilename(recording.filename);
                  const speakerLabel = autoName ?? aliasName ?? dbName ?? parsedName;
                  const unresolvedUuid = isUuidLike(speakerId) && !dbName && !autoName && !aliasName;

                  return (
                    <>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {speakerLabel}
                        </Typography>
                        {unresolvedUuid && (
                          <IconButton
                            aria-label="Set speaker name"
                            size="small"
                            onClick={() => setAliasForSpeakerId(speakerId)}
                          >
                            <EditIcon />
                          </IconButton>
                        )}
                      </Stack>
                      <Typography variant="body2" sx={{ opacity: 0.8 }}>
                        {recording.filename}
                      </Typography>
                    </>
                  );
                })()}
              </Stack>
              <audio
                ref={(node) => {
                  audioRefs.current[recording.id] = node;
                }}
                src={recording.downloadUrl}
                onEnded={() => setPlayingId((current) => (current === recording.id ? null : current))}
                preload="none"
                style={{ display: 'none' }}
              />
            </RecordingRow>
          ))}
        </Stack>
      )}
      {isError && <Alert severity="error">Failed to load recordings.</Alert>}
      {!isError && recordingAssets.length === 0 && (
        <Alert severity="warning">No recordings found yet for this account.</Alert>
      )}
      {recordingAssets.length > 0 && (
        <AssetTable
          assets={recordingAssets.map(mapToBaseAsset)}
          onDownload={async ({ assetId }) => {
            const roomId = getRoomId(assetId);
            if (!roomId) {
              return;
            }
            await downloadRoomAsset({ roomId, assetId });
          }}
          onDelete={async (assetId) => {
            const roomId = getRoomId(assetId);
            if (!roomId) {
              return;
            }
            try {
              return await deleteRoomAsset({ roomId, assetId });
            } catch (error) {
              log.error(`Error occurred when deleting recording asset ${assetId}:`, error);
              notifications.error('Failed to delete recording asset');
              return undefined;
            }
          }}
          maxHeight="37rem"
        />
      )}
    </Stack>
  );
};

export default AdminRecordingsPage;
