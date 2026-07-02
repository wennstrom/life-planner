export type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  updated?: string;
  status?: string;
};

export type GoogleCalendarClient = {
  insertEvent: (event: {
    summary: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
  }) => Promise<GoogleCalendarEvent>;
  updateEvent: (
    eventId: string,
    event: {
      summary: string;
      start: { dateTime: string; timeZone: string };
      end: { dateTime: string; timeZone: string };
    },
  ) => Promise<GoogleCalendarEvent>;
  deleteEvent: (eventId: string) => Promise<void>;
  listChanges: (opts: {
    syncToken?: string;
    timeMin?: string;
  }) => Promise<{
    events: Array<GoogleCalendarEvent>;
    nextSyncToken?: string;
  }>;
  watch: (opts: {
    channelId: string;
    address: string;
    expirationMs: number;
  }) => Promise<{ resourceId: string; expiration: number }>;
  refreshAccessToken: (refreshToken: string) => Promise<{
    accessToken: string;
    refreshToken?: string;
    expiryMs: number;
  }>;
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars/primary";

async function formatGoogleApiError(
  res: Response,
  operation: string,
): Promise<string> {
  let detail = res.statusText;
  try {
    const body = (await res.json()) as {
      error?: { message?: string; status?: string };
    };
    if (body.error?.message) {
      detail = body.error.message;
      if (body.error.status) {
        detail = `${body.error.status}: ${detail}`;
      }
    }
  } catch {
    // Response body was not JSON.
  }
  return `Google ${operation} failed (${res.status}): ${detail}`;
}

export function createGoogleCalendarClient(
  accessToken: string,
): GoogleCalendarClient {
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  return {
    async insertEvent(event) {
      const res = await fetch(`${CALENDAR_API}/events`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
      if (!res.ok) {
        throw new Error(await formatGoogleApiError(res, "insert"));
      }
      return (await res.json()) as GoogleCalendarEvent;
    },

    async updateEvent(eventId, event) {
      const res = await fetch(`${CALENDAR_API}/events/${eventId}`, {
        method: "PUT",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
      if (!res.ok) {
        throw new Error(await formatGoogleApiError(res, "update"));
      }
      return (await res.json()) as GoogleCalendarEvent;
    },

    async deleteEvent(eventId) {
      const res = await fetch(`${CALENDAR_API}/events/${eventId}`, {
        method: "DELETE",
        headers: authHeader,
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(await formatGoogleApiError(res, "delete"));
      }
    },

    async listChanges({ syncToken, timeMin }) {
      const fetchPage = async (token?: string, min?: string) => {
        const params = new URLSearchParams({ singleEvents: "true" });
        if (token) {
          params.set("syncToken", token);
        } else if (min) {
          params.set("timeMin", min);
        }

        const res = await fetch(`${CALENDAR_API}/events?${params}`, {
          headers: authHeader,
        });

        if (res.status === 410 && token) {
          return fetchPage(undefined, min);
        }

        if (!res.ok) {
          throw new Error(await formatGoogleApiError(res, "list"));
        }

        return (await res.json()) as {
          items?: Array<GoogleCalendarEvent>;
          nextSyncToken?: string;
        };
      };

      const data = await fetchPage(syncToken, timeMin);
      return {
        events: data.items ?? [],
        nextSyncToken: data.nextSyncToken,
      };
    },

    async watch({ channelId, address, expirationMs }) {
      const res = await fetch(`${CALENDAR_API}/events/watch`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: channelId,
          type: "web_hook",
          address,
          expiration: expirationMs,
        }),
      });
      if (!res.ok) {
        throw new Error(await formatGoogleApiError(res, "watch"));
      }
      const data = (await res.json()) as {
        resourceId: string;
        expiration: string;
      };
      return {
        resourceId: data.resourceId,
        expiration: Number(data.expiration),
      };
    },

    async refreshAccessToken(refreshToken) {
      const res = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.AUTH_GOOGLE_ID!,
          client_secret: process.env.AUTH_GOOGLE_SECRET!,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });
      if (!res.ok) {
        throw new Error(await formatGoogleApiError(res, "token refresh"));
      }
      const data = (await res.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      };
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiryMs: Date.now() + data.expires_in * 1000,
      };
    },
  };
}

let testClient: GoogleCalendarClient | null = null;

export function setGoogleCalendarClientForTests(client: GoogleCalendarClient | null) {
  testClient = client;
}

export function getGoogleCalendarClient(accessToken: string) {
  if (testClient) {
    return testClient;
  }
  return createGoogleCalendarClient(accessToken);
}

export function isGoogleCalendarClientMocked() {
  return testClient !== null;
}

export function toGoogleEventPayload(block: {
  title: string;
  start: number;
  end: number;
}) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return {
    summary: block.title,
    start: { dateTime: new Date(block.start).toISOString(), timeZone },
    end: { dateTime: new Date(block.end).toISOString(), timeZone },
  };
}

export function parseGoogleEventTimes(event: GoogleCalendarEvent) {
  const startStr = event.start.dateTime ?? event.start.date;
  const endStr = event.end.dateTime ?? event.end.date;
  if (!startStr || !endStr) {
    return null;
  }
  return {
    start: new Date(startStr).getTime(),
    end: new Date(endStr).getTime(),
    updatedAt: event.updated ? new Date(event.updated).getTime() : Date.now(),
  };
}
