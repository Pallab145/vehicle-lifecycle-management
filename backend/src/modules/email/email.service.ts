import { Resend } from 'resend';
import { logger } from '@/lib/logger';
import { env } from '@/config/env';
import { emailTemplates } from './email.templates';
import { enqueueEmailJob } from './jobs/email.queue';

const resend = new Resend(env.RESEND_API_KEY);

export const emailService = {
    /**
     * Public entrypoint: Enqueues an HTML email to be sent asynchronously in the background.
     */
    async sendEmail(to: string, subject: string, htmlBody: string): Promise<void> {
        if (env.NODE_ENV !== 'production') {
            logger.info({ event: 'mock_email', to, subject, bodyLength: htmlBody.length }, 'MOCK EMAIL SENT');
            console.log('\n================== MOCK EMAIL ==================');
            console.log(`To: ${to}`);
            console.log(`Subject: ${subject}`);
            console.log('------------------------------------------------');
            // Very simple regex to strip HTML for the console log so they can read the OTP/password easily
            console.log(htmlBody.replace(/<[^>]*>?/gm, '').trim().split('\n').map(l => l.trim()).filter(Boolean).join('\n'));
            console.log('================================================\n');
            return;
        }
        await enqueueEmailJob(to, subject, htmlBody);
    },

    /**
     * Direct execution: Sends an HTML email immediately using Resend.
     * Invoked by background workers.
     */
    async sendEmailDirect(to: string, subject: string, htmlBody: string): Promise<void> {
        try {
            const { data, error } = await resend.emails.send({
                from: env.EMAIL_FROM,
                to,
                subject,
                html: htmlBody,
            });

            if (error) {
                logger.error({ err: error, to, subject }, 'Failed to send email via Resend');
                throw new Error(`Email delivery failed: ${error.message}`);
            }

            logger.info({ event: 'email_sent', to, subject, resendId: data?.id }, 'Email successfully sent via Resend');
        } catch (err) {
            logger.error({ err, to, subject }, 'Unexpected error while sending email');
            throw err;
        }
    },

    /**
     * Sends an OTP for password reset.
     */
    async sendPasswordResetOtp(to: string, otp: string): Promise<void> {
        const subject = 'Your Password Reset OTP';
        const htmlBody = emailTemplates.passwordResetOtp(otp);
        
        await this.sendEmail(to, subject, htmlBody);
    },

    /**
     * Sends a welcome email to a new institutional member with their temporary credentials.
     */
    async sendWelcomeInstitutionalEmail(to: string, name: string, entityName: string, role: string, tempPass: string): Promise<void> {
        const subject = `Welcome to the Platform — ${entityName}`;
        const htmlBody = emailTemplates.welcomeInstitutionalMember(name, entityName, role, to, tempPass);
        
        await this.sendEmail(to, subject, htmlBody);
    }
};
