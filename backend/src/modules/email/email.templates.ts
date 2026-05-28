export const emailTemplates = {
    /**
     * Renders the HTML template for a Password Reset OTP.
     */
    passwordResetOtp(otp: string): string {
        return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px; background-color: #ffffff;">
            <h2 style="color: #333; text-align: center;">Password Reset Request</h2>
            <p style="color: #555; font-size: 16px; line-height: 1.5;">
                We received a request to reset your password for the Vehicle Lifecycle Management System. 
                Please use the following One-Time Password (OTP) to proceed:
            </p>
            <div style="text-align: center; margin: 30px 0;">
                <span style="display: inline-block; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #007bff; background: #f4f4f4; padding: 15px 25px; border-radius: 8px;">
                    ${otp}
                </span>
            </div>
            <p style="color: #555; font-size: 14px; line-height: 1.5;">
                This code will expire in <strong>15 minutes</strong>. If you did not request a password reset, please ignore this email or contact the central administrator.
            </p>
            <hr style="border: 0; border-top: 1px solid #eaeaea; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">
                &copy; ${new Date().getFullYear()} Vehicle Lifecycle Management System. All rights reserved.
            </p>
        </div>
        `;
    },

    /**
     * Renders the HTML template for B2B institutional staff registration.
     */
    welcomeInstitutionalMember(name: string, entityName: string, role: string, email: string, tempPassword: string): string {
        return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px; background-color: #ffffff;">
            <h2 style="color: #007bff; text-align: center; margin-bottom: 20px;">Welcome to the Platform</h2>
            <p style="color: #555; font-size: 16px; line-height: 1.5;">
                Hello <strong>${name}</strong>,
            </p>
            <p style="color: #555; font-size: 15px; line-height: 1.5;">
                A new B2B institutional account has been initialized for <strong>${entityName}</strong> on the Vehicle Lifecycle Management System. You have been registered as a member with the following administrative credentials:
            </p>
            <div style="background-color: #f8f9fa; border-radius: 8px; padding: 15px; margin: 20px 0; border: 1px solid #eee;">
                <table style="width: 100%; font-size: 14px; color: #555;">
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold; width: 120px;">Role:</td>
                        <td style="padding: 5px 0; color: #333;">${role}</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Login Email:</td>
                        <td style="padding: 5px 0; color: #333;">${email}</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; font-weight: bold;">Temp Password:</td>
                        <td style="padding: 5px 0; color: #dc3545; font-family: monospace; font-size: 16px; font-weight: bold;">${tempPassword}</td>
                    </tr>
                </table>
            </div>
            <p style="color: #555; font-size: 14px; line-height: 1.5; background-color: #fff3cd; border: 1px solid #ffeeba; padding: 10px; border-radius: 6px; color: #856404;">
                <strong>⚠️ Security Action Required:</strong> For security reasons, please log in immediately and change this temporary password.
            </p>
            <hr style="border: 0; border-top: 1px solid #eaeaea; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">
                &copy; ${new Date().getFullYear()} Vehicle Lifecycle Management System. All rights reserved.
            </p>
        </div>
        `;
    }
};
