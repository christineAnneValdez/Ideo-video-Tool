import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import {
  AudioStream,
  Room,
  RoomEvent,
  TrackKind,
} from '@livekit/rtc-node';

const config = {
  livekitUrl: process.env.LIVEKIT_URL ?? 'http://127.0.0.1:7880',
  livekitApiKey: process.env.LIVEKIT_API_KEY ?? 'devkey',
  livekitApiSecret: process.env.LIVEKIT_API_SECRET ?? 'secret',
  pollIntervalMs: Number(process.env.RECORDER_POLL_INTERVAL_MS ?? 3000),
  outputDir: process.env.RECORDER_OUTPUT_DIR ?? path.resolve(process.cwd(), 'recordings'),
  recordingsDatabaseUrl:
    process.env.RECORDINGS_DATABASE_URL ??
    process.env.OPENTALK_CTRL_DATABASE__URL ??
    'postgres://postgres:anne@127.0.0.1:5432/opentalk',
};

const { Client } = pg;
const RECORDER_BUILD_TAG = 'postgres-recordings-v1';

if (!config.livekitApiKey || !config.livekitApiSecret) {
  console.error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required');
  process.exit(1);
}

fs.mkdirSync(config.outputDir, { recursive: true });
const speakerIndexPath = path.join(config.outputDir, '_speaker-index.json');
let recordingsDbClient = null;
let recordingsDbReadyPromise = null;

async function ensureRecordingsDatabaseReady() {
  if (recordingsDbReadyPromise) {
    return recordingsDbReadyPromise;
  }

  recordingsDbClient = new Client({
    connectionString: config.recordingsDatabaseUrl,
  });

  recordingsDbReadyPromise = (async () => {
    await recordingsDbClient.connect();
    await recordingsDbClient.query(`
      CREATE TABLE IF NOT EXISTS local_recordings (
        id UUID PRIMARY KEY,
        room_name TEXT NOT NULL,
        participant_identity TEXT NOT NULL,
        participant_display_name TEXT,
        track_sid TEXT,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL DEFAULT 'audio/wav',
        audio_data BYTEA NOT NULL,
        size_bytes BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  })().catch((error) => {
    console.error('Failed to initialize recordings database', error);
    recordingsDbReadyPromise = null;
    throw error;
  });

  return recordingsDbReadyPromise;
}

async function storeRecordingInDatabase(entry) {
  try {
    await ensureRecordingsDatabaseReady();
    const audioData = fs.readFileSync(entry.filePath);
    const id = randomUUID();

    await recordingsDbClient.query(
      `
        INSERT INTO local_recordings (
          id,
          room_name,
          participant_identity,
          participant_display_name,
          track_sid,
          filename,
          mime_type,
          audio_data,
          size_bytes,
          created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [
        id,
        entry.roomName,
        entry.participantIdentity,
        entry.participantDisplayName,
        entry.trackSid,
        path.basename(entry.filePath),
        'audio/wav',
        audioData,
        audioData.length,
        entry.createdAt,
      ],
    );

    fs.unlinkSync(entry.filePath);
    const sidecarPath = `${entry.filePath}.json`;
    if (fs.existsSync(sidecarPath)) {
      fs.unlinkSync(sidecarPath);
    }

    console.log(
      `[${entry.roomName}] stored recording in database: ${path.basename(entry.filePath)} (${audioData.length} bytes)`,
    );
  } catch (error) {
    console.error(`[${entry.roomName}] failed storing recording in database`, error);
  }
}

async function backfillLocalRecordingsToDatabase() {
  try {
    await ensureRecordingsDatabaseReady();
    const files = listWavFiles(config.outputDir);

    for (const fullPath of files) {
      const filename = path.basename(fullPath);
      const stat = fs.statSync(fullPath);
      const relativePath = path.relative(config.outputDir, fullPath).replaceAll('\\', '/');
      const roomName = relativePath.includes('/') ? relativePath.split('/')[0] : 'unknown-room';
      const sidecar = readJsonFileSafe(`${fullPath}.json`, {});
      const participantIdentity =
        sidecar.participantIdentity ?? parseParticipantIdentityFromFilename(filename);
      const participantDisplayName =
        sidecar.participantDisplayName ?? parseDisplayNameFromFilename(filename);
      const trackSid = sidecar.trackSid ?? null;
      const createdAt = sidecar.createdAt ?? stat.mtime.toISOString();

      const existing = await recordingsDbClient.query(
        `
          SELECT 1
          FROM local_recordings
          WHERE filename = $1 AND size_bytes = $2
          LIMIT 1
        `,
        [filename, stat.size],
      );
      if ((existing.rowCount ?? 0) > 0) {
        continue;
      }

      await storeRecordingInDatabase({
        filePath: fullPath,
        roomName,
        participantIdentity,
        participantDisplayName,
        trackSid,
        createdAt,
      });
    }
  } catch (error) {
    console.error('Backfill local recordings to database failed', error);
  }
}

function sanitizeFilePart(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function writeJsonFileSafe(filePath, payload) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error(`Failed writing JSON file ${filePath}`, error);
  }
}

function readJsonFileSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function listWavFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listWavFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.wav')) {
      files.push(fullPath);
    }
  }
  return files;
}

function parseParticipantIdentityFromFilename(filename) {
  const base = filename.replace(/\.wav$/i, '');
  if (base.includes('__')) {
    const [, rest] = base.split('__');
    return (rest ?? '').split('_')[0] ?? 'unknown';
  }
  return base.split('_')[0] ?? 'unknown';
}

function parseDisplayNameFromFilename(filename) {
  const base = filename.replace(/\.wav$/i, '');
  if (base.includes('__')) {
    const [display] = base.split('__');
    return (display ?? '').replaceAll('_', ' ') || null;
  }
  return null;
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || '').trim(),
  );
}

function upsertSpeakerIndex(participantIdentity, displayName, roomName) {
  if (!participantIdentity || !displayName) {
    return;
  }

  const payload = readJsonFileSafe(speakerIndexPath, {});
  payload[participantIdentity] = {
    displayName,
    roomName,
    updatedAt: new Date().toISOString(),
  };
  writeJsonFileSafe(speakerIndexPath, payload);
}

function extractParticipantDisplayName(participant) {
  const attributeCandidates = [
    participant?.attributes?.displayName,
    participant?.attributes?.display_name,
    participant?.attributes?.firstName,
    participant?.attributes?.firstname,
    participant?.attributes?.given_name,
    participant?.attributes?.preferred_username,
    participant?.attributes?.name,
    participant?.attributes?.participantName,
  ];
  for (const candidate of attributeCandidates) {
    if (candidate && String(candidate).trim().length > 0) {
      return String(candidate).trim();
    }
  }

  if (participant?.name && String(participant.name).trim().length > 0) {
    const value = String(participant.name).trim();
    if (!isUuidLike(value) && !/^local-recorder-/i.test(value)) {
      return value;
    }
  }

  if (participant?.metadata) {
    try {
      const metadata = JSON.parse(participant.metadata);
      const candidate =
        metadata?.displayName ??
        metadata?.display_name ??
        metadata?.firstName ??
        metadata?.firstname ??
        metadata?.given_name ??
        metadata?.preferred_username ??
        metadata?.name ??
        metadata?.profile?.displayName;
      if (candidate && String(candidate).trim().length > 0) {
        return String(candidate).trim();
      }
    } catch {
      // ignore invalid metadata payloads
    }
  }

  return undefined;
}

function extractParticipantIdentity(participant) {
  const attributeCandidates = [
    participant?.attributes?.userId,
    participant?.attributes?.user_id,
    participant?.attributes?.userid,
    participant?.attributes?.opentalk_user_id,
    participant?.attributes?.sub,
    participant?.attributes?.oidc_sub,
    participant?.attributes?.id,
  ];
  for (const candidate of attributeCandidates) {
    if (candidate && String(candidate).trim().length > 0) {
      return String(candidate).trim();
    }
  }

  return String(participant?.identity || participant?.sid || 'unknown');
}

function toWsUrl(httpOrWsUrl) {
  if (httpOrWsUrl.startsWith('ws://') || httpOrWsUrl.startsWith('wss://')) {
    return httpOrWsUrl;
  }
  if (httpOrWsUrl.startsWith('https://')) {
    return `wss://${httpOrWsUrl.slice('https://'.length)}`;
  }
  if (httpOrWsUrl.startsWith('http://')) {
    return `ws://${httpOrWsUrl.slice('http://'.length)}`;
  }
  return `ws://${httpOrWsUrl}`;
}

function writeWavHeader(fd, dataLengthBytes, sampleRate, channels, bitsPerSample) {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(36 + dataLengthBytes, 4);
  header.write('WAVE', 8, 4, 'ascii');
  header.write('fmt ', 12, 4, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 4, 'ascii');
  header.writeUInt32LE(dataLengthBytes, 40);
  fs.writeSync(fd, header, 0, header.length, 0);
}

class WavWriter {
  constructor(filePath, sampleRate = 48000, channels = 1, bitsPerSample = 16) {
    this.filePath = filePath;
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.bitsPerSample = bitsPerSample;
    this.dataLengthBytes = 0;
    this.fd = fs.openSync(filePath, 'w');
    writeWavHeader(this.fd, 0, sampleRate, channels, bitsPerSample);
  }

  writePcm(buffer) {
    fs.writeSync(this.fd, buffer);
    this.dataLengthBytes += buffer.length;
  }

  close() {
    if (this.fd == null) return;
    writeWavHeader(
      this.fd,
      this.dataLengthBytes,
      this.sampleRate,
      this.channels,
      this.bitsPerSample,
    );
    fs.closeSync(this.fd);
    this.fd = null;
  }
}

class RoomRecorder {
  constructor(roomName) {
    this.roomName = roomName;
    this.room = new Room();
    this.activeWriters = new Map();
    this.runningStreams = new Set();
    this.stopped = false;
    this.hookEvents();
  }

  hookEvents() {
    this.room.on(RoomEvent.ParticipantConnected, (participant) => {
      console.log(`[${this.roomName}] participant connected: ${participant.identity}`);
    });

    this.room.on(RoomEvent.TrackPublished, (publication, participant) => {
      const sid = publication.trackSid || publication.sid || 'unknown';
      console.log(
        `[${this.roomName}] track published: ${participant?.identity ?? 'unknown'} ${sid}`,
      );
    });

    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (this.stopped) return;
      const publicationKind = publication.kind;
      const trackKind = track.kind;
      const isAudio =
        publicationKind === TrackKind.KIND_AUDIO || trackKind === TrackKind.KIND_AUDIO;
      if (!isAudio) {
        console.log(
          `[${this.roomName}] non-audio subscription ignored: publication.kind=${publicationKind} track.kind=${trackKind}`,
        );
        return;
      }
      console.log(
        `[${this.roomName}] track subscribed: ${participant.identity} publication.kind=${publicationKind} track.kind=${trackKind}`,
      );

      const participantIdentityRaw = extractParticipantIdentity(participant);
      const participantIdentity = sanitizeFilePart(participantIdentityRaw);
      const participantDisplayNameRaw = String(
        extractParticipantDisplayName(participant) || 'unknown',
      );
      const participantDisplayName = sanitizeFilePart(participantDisplayNameRaw);
      const trackId = sanitizeFilePart(publication.trackSid || publication.sid || Date.now());
      const roomDir = path.join(config.outputDir, sanitizeFilePart(this.roomName));
      fs.mkdirSync(roomDir, { recursive: true });
      const filePath = path.join(
        roomDir,
        `${participantDisplayName}__${participantIdentity}_${trackId}_${Date.now()}.wav`,
      );
      const relativePath = path.relative(config.outputDir, filePath).replaceAll('\\', '/');

      upsertSpeakerIndex(participantIdentityRaw, participantDisplayNameRaw, this.roomName);
      writeJsonFileSafe(`${filePath}.json`, {
        roomName: this.roomName,
        relativePath,
        fileName: path.basename(filePath),
        participantIdentity: participantIdentityRaw,
        participantSid: participant.sid || null,
        participantDisplayName: participantDisplayNameRaw,
        trackSid: publication.trackSid || publication.sid || null,
        createdAt: new Date().toISOString(),
      });

      const key = publication.trackSid || publication.sid || `${participantIdentity}-${Date.now()}`;
      this.consumeAudio(track, key, {
        filePath,
        roomName: this.roomName,
        participantIdentity: participantIdentityRaw,
        participantDisplayName: participantDisplayNameRaw,
        trackSid: publication.trackSid || publication.sid || null,
        createdAt: new Date().toISOString(),
      }).catch((err) => {
        console.error(`[${this.roomName}] failed consuming audio`, err);
      });
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (_track, publication) => {
      const key = publication.trackSid || publication.sid;
      this.closeWriter(key);
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      for (const publication of participant.trackPublications.values()) {
        const key = publication.trackSid || publication.sid;
        this.closeWriter(key);
      }
    });

    this.room.on(RoomEvent.Disconnected, () => {
      console.log(`[${this.roomName}] disconnected`);
      for (const key of Array.from(this.activeWriters.keys())) {
        this.closeWriter(key);
      }
    });

    this.room.on(RoomEvent.TrackSubscriptionFailed, (trackSid, participant, error) => {
      console.error(
        `[${this.roomName}] track subscription failed: ${participant.identity} ${trackSid} ${error}`,
      );
    });
  }

  closeWriter(key) {
    const entry = this.activeWriters.get(key);
    if (!entry) return;
    entry.writer.close();
    this.activeWriters.delete(key);
    void storeRecordingInDatabase(entry.recordingEntry);
  }

  async consumeAudio(track, key, recordingEntry) {
    this.runningStreams.add(key);
    let writer = null;
    try {
      const stream = new AudioStream(track);
      for await (const frame of stream) {
        if (this.stopped) break;
        if (!writer) {
          writer = new WavWriter(recordingEntry.filePath, frame.sampleRate, frame.channels, 16);
          this.activeWriters.set(key, {
            writer,
            recordingEntry,
          });
          console.log(
            `[${this.roomName}] writing ${recordingEntry.filePath} (${frame.sampleRate}Hz, ${frame.channels}ch)`,
          );
        }
        const data = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
        writer.writePcm(data);
      }
    } finally {
      this.runningStreams.delete(key);
      this.closeWriter(key);
    }
  }

  async connect() {
    const token = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
      identity: `local-recorder-${sanitizeFilePart(this.roomName)}-${Date.now()}`,
    });
    token.addGrant({
      roomJoin: true,
      room: this.roomName,
      canSubscribe: true,
      canPublish: false,
      canPublishData: false,
      hidden: true,
      recorder: true,
    });

    const wsUrl = toWsUrl(config.livekitUrl);
    await this.room.connect(wsUrl, await token.toJwt(), {
      autoSubscribe: true,
      dynacast: false,
    });
    console.log(`[${this.roomName}] recorder joined`);
  }

  async disconnect() {
    this.stopped = true;
    this.room.disconnect();
    for (const key of Array.from(this.activeWriters.keys())) {
      this.closeWriter(key);
    }
  }
}

class RecorderAgent {
  constructor() {
    this.running = true;
    this.recorders = new Map();
    this.tickCount = 0;
    this.roomService = new RoomServiceClient(
      config.livekitUrl,
      config.livekitApiKey,
      config.livekitApiSecret,
    );
  }

  async tick() {
    const result = await this.roomService.listRooms();
    const rooms = result ?? [];
    const activeRoomNames = new Set(rooms.map((r) => r.name).filter(Boolean));
    this.tickCount += 1;

    if (this.tickCount % 2 === 0) {
      const roomNames = Array.from(activeRoomNames.values());
      console.log(
        `[tick] active_rooms=${roomNames.length} joined_recorders=${this.recorders.size} rooms=${roomNames.join(',')}`,
      );
    }

    for (const roomName of activeRoomNames) {
      if (!this.recorders.has(roomName)) {
        const recorder = new RoomRecorder(roomName);
        this.recorders.set(roomName, recorder);
        recorder.connect().catch((err) => {
          console.error(`[${roomName}] failed to connect recorder`, err);
          this.recorders.delete(roomName);
        });
      }
    }

    for (const [roomName, recorder] of this.recorders.entries()) {
      if (!activeRoomNames.has(roomName)) {
        console.log(`[${roomName}] room ended; stopping recorder`);
        await recorder.disconnect();
        this.recorders.delete(roomName);
      }
    }
  }

  async run() {
    console.log('Local recorder agent started');
    console.log(`Recorder build: ${RECORDER_BUILD_TAG}`);
    console.log(`LiveKit: ${config.livekitUrl}`);
    console.log(`Output: ${config.outputDir}`);
    console.log(`Recordings DB: ${config.recordingsDatabaseUrl}`);
    await backfillLocalRecordingsToDatabase();

    while (this.running) {
      try {
        await this.tick();
      } catch (err) {
        console.error('Recorder tick failed', err);
      }
      await sleep(config.pollIntervalMs);
    }
  }

  async stop() {
    this.running = false;
    for (const recorder of this.recorders.values()) {
      await recorder.disconnect();
    }
    this.recorders.clear();
    if (recordingsDbClient) {
      await recordingsDbClient.end().catch(() => undefined);
      recordingsDbClient = null;
    }
  }
}

const agent = new RecorderAgent();
process.on('SIGINT', async () => {
  console.log('Stopping recorder agent...');
  await agent.stop();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await agent.stop();
  process.exit(0);
});

await agent.run();
