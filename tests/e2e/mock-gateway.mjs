import { WebSocketServer } from 'ws';

const PORT = 18789;
const challengeNonce = 'relay-e2e-challenge';

let runCounter = 0;

function sendFrame(socket, frame) {
  socket.send(JSON.stringify(frame));
}

function relayActionPayloadForRun(runId) {
  return {
    runId,
    state: 'final',
    message: {
      role: 'assistant',
      text: [
        'I generated an action request.',
        '```json',
        JSON.stringify(
          {
            relay_actions: [
              {
                id: 'mock-action-1',
                type: 'append_file',
                path: 'relay-e2e/mock-approval.txt',
                content: 'line from mock gateway',
              },
            ],
          },
          null,
          2,
        ),
        '```',
      ].join('\n'),
    },
  };
}

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });

wss.on('connection', (socket) => {
  sendFrame(socket, {
    type: 'event',
    event: 'connect.challenge',
    payload: { nonce: challengeNonce },
  });

  socket.on('message', (buffer) => {
    let parsed;
    try {
      parsed = JSON.parse(buffer.toString('utf8'));
    } catch {
      return;
    }

    if (!parsed || parsed.type !== 'req' || typeof parsed.id !== 'string') {
      return;
    }

    const reqId = parsed.id;
    const method = parsed.method;
    const params = parsed.params ?? {};

    if (method === 'connect') {
      sendFrame(socket, {
        type: 'res',
        id: reqId,
        ok: true,
        payload: {
          auth: {
            scopes: ['operator.read', 'operator.write', 'operator.admin'],
          },
        },
      });
      return;
    }

    if (method === 'sessions.list') {
      sendFrame(socket, {
        type: 'res',
        id: reqId,
        ok: true,
        payload: {
          defaults: { mainSessionKey: 'main' },
          sessions: [
            { key: 'main', kind: 'main', title: 'Main' },
          ],
        },
      });
      return;
    }

    if (method === 'sessions.patch') {
      sendFrame(socket, {
        type: 'res',
        id: reqId,
        ok: true,
        payload: {},
      });
      return;
    }

    if (method === 'cron.list') {
      sendFrame(socket, {
        type: 'res',
        id: reqId,
        ok: true,
        payload: { jobs: [] },
      });
      return;
    }

    if (method === 'models.list') {
      sendFrame(socket, {
        type: 'res',
        id: reqId,
        ok: true,
        payload: { models: [] },
      });
      return;
    }

    if (method === 'chat.send') {
      sendFrame(socket, {
        type: 'res',
        id: reqId,
        ok: true,
        payload: {},
      });

      const sessionKey = typeof params.sessionKey === 'string' ? params.sessionKey : 'main';
      const promptText = typeof params.message === 'string' ? params.message : '';
      runCounter += 1;
      const runId = `mock-run-${runCounter}`;
      const payload = relayActionPayloadForRun(runId);
      const finalDelayMs = promptText.includes('DELAY_LONG') ? 1200 : 120;

      setTimeout(() => {
        sendFrame(socket, {
          type: 'event',
          event: 'chat',
          payload: {
            sessionKey,
            ...payload,
          },
        });
      }, finalDelayMs);
      return;
    }

    if (method === 'chat.history') {
      sendFrame(socket, {
        type: 'res',
        id: reqId,
        ok: true,
        payload: { messages: [] },
      });
      return;
    }

    sendFrame(socket, {
      type: 'res',
      id: reqId,
      ok: true,
      payload: {},
    });
  });
});

const shutdown = () => {
  for (const client of wss.clients) {
    try {
      client.close();
    } catch {
      // ignore
    }
  }

  wss.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`[relay-e2e-mock-gateway] listening on ws://127.0.0.1:${PORT}`);
