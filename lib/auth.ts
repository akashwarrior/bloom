import "server-only";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { headers } from "next/headers";
import { cache } from "react";
import prisma from "@/lib/prisma";

const googleClientId = process.env.GOOGLE_CLIENT_ID as string;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET as string;

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
  },

  socialProviders: {
    google: {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    },
  },

  session: {
    cookieCache: {
      enabled: true,
      maxAge: 10 * 60,
    },
  },

  plugins: [nextCookies()],
});

export const getServerSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);
