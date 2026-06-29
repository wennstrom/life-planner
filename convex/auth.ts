import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import {
  extractGoogleTokens,
  stripGoogleTokenFields,
  upsertGoogleAccountTokens,
} from "./lib/googleTokens";

const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          scope: `openid email profile ${GOOGLE_CALENDAR_SCOPE}`,
        },
      },
      profile(profile, tokens) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
          emailVerified: profile.email_verified,
          _googleAccessToken: tokens.access_token,
          _googleRefreshToken: tokens.refresh_token,
          _googleExpiresAt: tokens.expires_at
            ? tokens.expires_at * 1000
            : undefined,
        };
      },
    }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      const tokens = extractGoogleTokens(args.profile);
      const cleanProfile = stripGoogleTokenFields(args.profile);

      const emailVerified = args.type === "oauth";

      const userData = {
        ...(emailVerified ? { emailVerificationTime: Date.now() } : {}),
        name: cleanProfile.name as string | undefined,
        email: cleanProfile.email as string | undefined,
        image: cleanProfile.image as string | undefined,
      };

      let userId = args.existingUserId;
      if (userId) {
        await ctx.db.patch("users", userId, userData);
      } else {
        userId = await ctx.db.insert("users", userData);
      }

      if (args.provider.id === "google") {
        await upsertGoogleAccountTokens(ctx, userId, tokens);
      }

      return userId;
    },
  },
});
