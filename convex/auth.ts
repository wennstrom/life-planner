import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { createOrUpdateOAuthUser } from "./lib/googleTokens";

const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
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
      return await createOrUpdateOAuthUser(ctx, args.existingUserId, args);
    },
  },
});
