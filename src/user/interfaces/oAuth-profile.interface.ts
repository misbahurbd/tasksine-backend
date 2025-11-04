export interface OAuthProfile {
  provider: string;
  providerId: string;
  email: string;
  name: string;
  username?: string;
  image?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}
