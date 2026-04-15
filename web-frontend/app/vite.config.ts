// SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
//
// SPDX-License-Identifier: EUPL-1.2
import replace from '@rollup/plugin-replace';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { HmrContext, ResolvedConfig, Plugin } from 'vite';
import svgr from 'vite-plugin-svgr';
import { defineConfig } from 'vitest/config';

import { cleanPackageVersion } from './utils/build';

const DEFAULT_BUILD_PATH = '../dist';
const WARNINGS_TO_IGNORE = [['SOURCEMAP_ERROR', "Can't resolve original location of error"]];

const isProduction = process.env.NODE_ENV === 'production';

const sentryVersion = JSON.parse(fs.readFileSync('./package.json', 'utf-8')).dependencies?.['@sentry/react'] ?? '0.0.0';

// Monorepo package aliases - used for both dev and prod
const monorepoPackageAliases = {
  '@opentalk/rest-api-rtk-query': path.resolve(__dirname, '../packages/rtk-rest-api/src/index.ts'),
  '@opentalk/redux-oidc': path.resolve(__dirname, '../packages/redux-oidc/src/index.ts'),
  '@opentalk/fluent_conv': path.resolve(__dirname, '../packages/fluent_conv/src/index.ts'),
  '@opentalk/i18next-fluent': path.resolve(__dirname, '../packages/i18next-fluent/src/index.ts'),
};

// This plugin is only for development.
// Enables Hot Module Replacement for the libs in the monorepo to speed up their development
const packagesHmrPlugin = (): Plugin => ({
  name: 'opentalk-packages-hmr-plugin',
  apply: 'serve',
  config: () => ({
    resolve: {
      alias: monorepoPackageAliases,
    },
  }),
});

// Found here https://stackoverflow.com/questions/69626090/how-to-watch-public-directory-in-vite-project-for-hot-reload
// `handleHotUpdate` hook will be deprecated in the future in favor of `hotUpdate`
const i18nHotReloadPlugin = () => ({
  name: 'i18n-hot-reload-plugin',
  handleHotUpdate: ({ file, server }: HmrContext) => {
    if (file.includes('locales') && file.endsWith('.ftl')) {
      console.log('Locale file updated');
      server.ws.send({
        type: 'custom',
        event: 'locales-update',
      });
    }
  },
});

const ignoreWarningsPlugin = () => ({
  name: 'ignore-warnings-plugin',
  configResolved(config: ResolvedConfig) {
    const originalWarn = config.logger.warn;
    config.logger.warn = (msg: string, options?: { clear?: boolean; timestamp?: boolean }) => {
      if (WARNINGS_TO_IGNORE.some(([id, text]) => msg.includes(id) && msg.includes(text))) {
        return;
      }
      originalWarn(msg, options);
    };
  },
});

const localRecordingsPlugin = (): Plugin => ({
  name: 'local-recordings-plugin',
  apply: 'serve',
  configureServer(server) {
    const { Client } = pg;
    const recordingsDatabaseUrl =
      process.env.RECORDINGS_DATABASE_URL ??
      process.env.OPENTALK_CTRL_DATABASE__URL ??
      'postgres://postgres:anne@127.0.0.1:5432/opentalk';

    const dbClient = new Client({
      connectionString: recordingsDatabaseUrl,
    });
    let dbReadyPromise: Promise<void> | null = null;
    const ensureDbReady = () => {
      if (dbReadyPromise) {
        return dbReadyPromise;
      }
      dbReadyPromise = (async () => {
        await dbClient.connect();
        await dbClient.query(`
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
      })();

      return dbReadyPromise;
    };

    server.middlewares.use((req, res, next) => {
      if (!req.url) {
        return next();
      }

      const url = new URL(req.url, 'http://localhost');

      if (url.pathname === '/__local-recordings') {
        void (async () => {
          try {
            await ensureDbReady();
            const { rows } = await dbClient.query<{
              id: string;
              filename: string;
              participant_identity: string;
              participant_display_name: string | null;
              resolved_display_name: string | null;
              size_bytes: number;
              created_at: string;
            }>(
              `
                SELECT
                  lr.id,
                  lr.filename,
                  lr.participant_identity,
                  lr.participant_display_name,
                  COALESCE(
                    NULLIF(u.firstname, ''),
                    NULLIF(u_oidc.firstname, ''),
                    NULLIF(
                      CASE
                        WHEN lr.participant_display_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                          OR lr.participant_display_name ~* '^local-recorder-'
                          OR lower(lr.participant_display_name) = 'unknown'
                        THEN ''
                        ELSE lr.participant_display_name
                      END,
                      ''
                    ),
                    u.display_name,
                    u_oidc.display_name
                  ) AS resolved_display_name,
                  lr.size_bytes,
                  lr.created_at
                FROM local_recordings lr
                LEFT JOIN users u
                  ON lr.participant_identity ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 AND u.id = lr.participant_identity::uuid
                LEFT JOIN users u_oidc
                  ON u_oidc.oidc_sub = lr.participant_identity
                ORDER BY lr.created_at DESC
                LIMIT 500
              `
            );

            const recordings = rows.map((row) => ({
              id: row.id,
              filename: row.filename,
              relativePath: row.id,
              size: Number(row.size_bytes ?? 0),
              createdAt: new Date(row.created_at).toISOString(),
              speakerId: row.participant_identity,
              speakerName:
                row.resolved_display_name ??
                (row.participant_display_name &&
                row.participant_display_name.toLowerCase() !== 'unknown'
                  ? row.participant_display_name
                  : null),
              downloadUrl: `/__local-recordings/file?id=${encodeURIComponent(row.id)}`,
            }));

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ recordings }));
          } catch {
            res.statusCode = 500;
            res.end('Failed to load recordings');
          }
        })();
        return;
      }

      if (url.pathname === '/__local-recordings/file') {
        const recordingId = url.searchParams.get('id');
        if (!recordingId) {
          res.statusCode = 400;
          res.end('Missing id');
          return;
        }

        void (async () => {
          try {
            await ensureDbReady();
            const { rows } = await dbClient.query<{
              filename: string;
              mime_type: string;
              audio_data: Buffer;
            }>(
              `
                SELECT filename, mime_type, audio_data
                FROM local_recordings
                WHERE id = $1
                LIMIT 1
              `,
              [recordingId]
            );
            if (rows.length === 0) {
              res.statusCode = 404;
              res.end('File not found');
              return;
            }

            const row = rows[0];
            res.setHeader('Content-Type', row.mime_type || 'audio/wav');
            res.setHeader('Content-Disposition', `attachment; filename="${row.filename}"`);
            res.end(row.audio_data);
          } catch {
            res.statusCode = 500;
            res.end('Failed to read recording');
          }
        })();
        return;
      }

      if (url.pathname === '/__local-recordings/delete' && req.method === 'DELETE') {
        const recordingId = url.searchParams.get('id');
        if (!recordingId) {
          res.statusCode = 400;
          res.end('Missing id');
          return;
        }

        void (async () => {
          try {
            await ensureDbReady();
            const result = await dbClient.query(
              `DELETE FROM local_recordings WHERE id = $1`,
              [recordingId]
            );
            if ((result.rowCount ?? 0) === 0) {
              res.statusCode = 404;
              res.end('File not found');
              return;
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.statusCode = 500;
            res.end('Failed to delete file');
          }
        })();
        return;
      }

      return next();
    });
  },
});

export default defineConfig(({ command, mode }) => {
  const hmr = process.env.HMR === 'true';
  const buildPath = process.env.BUILD_PATH ?? DEFAULT_BUILD_PATH;

  const getAppVersion = () => {
    if (command === 'build') {
      try {
        const gitCommitHash = execSync('git rev-parse --short HEAD').toString().trim();
        if (gitCommitHash) {
          return gitCommitHash;
        }
      } catch {
        // Docker/CI builds may not include .git metadata
      }
      return process.env.VITE_APP_VERSION ?? 'unknown';
    }
    return 'dev';
  };

  const profiling = isProduction &&
    mode === 'profiling' && {
      'react-dom/client': 'react-dom/profiling',
    };

  return {
    logLevel: 'info',
    define: {
      __SENTRY_VERSION__: JSON.stringify(cleanPackageVersion(sentryVersion)),
    },
    plugins: [
      hmr && packagesHmrPlugin(),
      i18nHotReloadPlugin(),
      localRecordingsPlugin(),
      replace({
        VITE_APP_VERSION: getAppVersion(),
        preventAssignment: true,
      }),
      ignoreWarningsPlugin(),
      sentryVitePlugin({
        telemetry: false,
        authToken: process.env.SENTRY_AUTH_TOKEN || '1234567890',
        org: process.env.SENTRY_ORG || '1234567890',
        project: process.env.SENTRY_PROJECT || '1234567890',
        reactComponentAnnotation: {
          enabled: true,
          ignoredComponents: ['ThemeProvider'],
        },
      }),
      react({
        babel: {
          plugins: ['babel-plugin-react-compiler'],
        },
      }),
      svgr({
        svgrOptions: {
          titleProp: true,
        },
      }),
    ].filter(Boolean),
    server: {
      open: true,
      port: 3000,
    },
    optimizeDeps: {
      include: ['@reduxjs/toolkit', 'react', 'react-dom', 'react-redux'],
    },
    build: {
      outDir: buildPath,
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        external: ['/config.js'],
      },
      chunkSizeWarningLimit: 1200,
    },
    esbuild: {
      minifyIdentifiers: false,
    },
    resolve: {
      dedupe: ['react', 'react-dom', '@reduxjs/toolkit', 'react-redux'],
      alias: {
        ...monorepoPackageAliases,
        ...profiling,
      },
    },
    test: {
      name: { label: 'app', color: 'yellow' },
      environment: 'happy-dom',
      logHeapUsage: true,
      globals: true,
      setupFiles: ['./src/setupTests.ts'],
      env: {
        TZ: 'UTC',
      },
    },
  };
});
