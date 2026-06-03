import { z } from 'zod';
import { AUTH } from '@/config/constants';

// ── Institution (B2B) Schemas ──

export const LoginInstitutionSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
});
export type LoginInstitutionInput = z.infer<typeof LoginInstitutionSchema>;

export const ForgotPasswordSchema = z.object({
    email: z.string().email('Invalid email address'),
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
    email: z.string().email('Invalid email address'),
    otpCode: z.string().length(AUTH.OTP_LENGTH, `OTP must be exactly ${AUTH.OTP_LENGTH} digits`),
    newPassword: z.string().min(AUTH.PASSWORD_MIN_LENGTH, `Password must be at least ${AUTH.PASSWORD_MIN_LENGTH} characters`),
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

// ── Citizen (B2C) Schemas ──

export const LoginCitizenSchema = z.object({
    walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum wallet address'),
    message: z.string().min(1, 'Message is required'),
    signature: z.string().min(1, 'Signature is required'),
});
export type LoginCitizenInput = z.infer<typeof LoginCitizenSchema>;

export const LoginCitizenAadhaarSchema = z.object({
    vehicleId: z.string().min(1, 'Vehicle ID is required'),
    documentNumber: z.string().min(1, 'Aadhaar / Gov ID is required'),
});
export type LoginCitizenAadhaarInput = z.infer<typeof LoginCitizenAadhaarSchema>;
