import COMMON_DATA from './common-data.json';

// Credentials resolver: prefers environment variables (GitHub secrets in CI,
// or a local .env file) and falls back to the values in common-data.json.
// The PASSWORD env var is shared across all users.
const PASSWORD = process.env.PASSWORD;

export const CREDENTIALS = {
  credentials: {
    username: process.env.FIRSTUSERNAME ?? COMMON_DATA.credentials.username,
    password: PASSWORD ?? COMMON_DATA.credentials.password,
  },
  secondCredentials: {
    username: process.env.SECONDUSERNAME ?? COMMON_DATA.secondCredentials.username,
    password: PASSWORD ?? COMMON_DATA.secondCredentials.password,
  },
  thirdCredentials: {
    username: process.env.THIRDUSERNAME ?? COMMON_DATA.thirdCredentials.username,
    password: PASSWORD ?? COMMON_DATA.thirdCredentials.password,
  },
  verifierCredentials: {
    username: process.env.VERIFIERUSERNAME ?? COMMON_DATA.verifierCredentials.username,
    password: PASSWORD ?? COMMON_DATA.verifierCredentials.password,
  },
};
