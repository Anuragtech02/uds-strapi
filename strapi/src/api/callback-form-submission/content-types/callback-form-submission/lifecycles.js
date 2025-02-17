module.exports = {
  async afterCreate(event) {
    console.log("Processing new form submission for emails");
    const { result } = event;
    const logoUrl =
      "https://udsweb.s3.ap-south-1.amazonaws.com/UDS_LOGO_White_fb96f6add9.png";

    const getActiveEmailAddresses = async () => {
      try {
        // Fetch the common single type with emailConfig
        const commonConfig = await strapi.entityService.findOne(
          "api::common.common",
          1, // Single type always has ID 1
          {
            populate: ["emailConfig"],
          }
        );

        if (!commonConfig?.emailConfig) {
          console.log("No email configuration found, using default addresses");
          return [];
        }

        const currentTime = new Date();
        const currentHour = currentTime.getHours();
        const currentMinutes = currentTime.getMinutes();
        const currentTimeString = `${String(currentHour).padStart(
          2,
          "0"
        )}:${String(currentMinutes).padStart(2, "0")}`;

        // Filter email addresses based on time ranges
        return commonConfig.emailConfig
          .filter((config) => {
            if (!config.startTime || !config.endTime || !config.email)
              return false;

            // Convert times to comparable format (24-hour)
            const start = config.startTime;
            const end = config.endTime;

            // Handle time range crossing midnight
            if (end < start) {
              return currentTimeString >= start || currentTimeString <= end;
            }

            return currentTimeString >= start && currentTimeString <= end;
          })
          .map((config) => config.email);
      } catch (error) {
        console.error("Error fetching email configuration:", error);
        return [];
      }
    };

    const emailStyles = `
    /* Reset styles */
    body, table, td, div, p {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
      line-height: 1.4;
    }
    
    /* Container styles */
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #ffffff;
    }
    
    /* Header styles */
    .header {
      text-align: center;
      padding: 20px 0;
      background-color: #09184C;
    }
    
    .logo {
      max-width: 200px;
      height: auto;
    }
    
    /* Content styles */
    .content {
      padding: 30px 20px;
      background-color: #f9f9f9;
    }
    
    .submission-title {
      color: #09184C;
      font-size: 24px;
      margin-bottom: 20px;
      text-align: center;
    }
    
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    
    .info-table td {
      padding: 12px;
      border-bottom: 1px solid #e0e0e0;
    }
    
    .info-label {
      color: #09184C;
      font-weight: bold;
      width: 40%;
    }
    
    .info-value {
      color: #333333;
    }

    .message-text {
      color: #333333;
      margin: 20px 0;
      line-height: 1.6;
    }
    
    /* Footer styles */
    .footer {
      text-align: center;
      padding: 20px;
      color: #666666;
      font-size: 12px;
    }
    
    /* Mobile responsiveness */
    @media only screen and (max-width: 480px) {
      .container {
        width: 100% !important;
        padding: 10px !important;
      }
      
      .content {
        padding: 20px 10px !important;
      }
      
      .info-table td {
        display: block;
        width: 100%;
      }
      
      .info-label {
        border-bottom: none;
        padding-bottom: 0;
      }
    }
  `;

    // Function to send team notification email
    const sendTeamNotification = async () => {
      const additionalEmails = await getActiveEmailAddresses();

      // Combine default and time-based email addresses
      const allRecipients = ["contact@univdatos.com", ...additionalEmails];

      // Remove duplicates
      const uniqueRecipients = [...new Set(allRecipients)];
      console.log("Sending contact form notification to:", uniqueRecipients);

      try {
        console.log("Sending notification email to team...");
        await strapi.plugins["email"].services.email.send({
          to: uniqueRecipients,
          from: "contact@univdatos.com",
          subject: "New Callback Form Submission",
          html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>New Callback Form Submission</title>
              <style>${emailStyles}</style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <img src="${logoUrl}" alt="UnivDatos" class="logo">
                </div>
                
                <div class="content">
                  <h1 class="submission-title">New Contact Form Submission</h1>
                  
                  <table class="info-table">
                    ${
                      result.fullName
                        ? `
                      <tr>
                        <td class="info-label">Full Name</td>
                        <td class="info-value">${result.fullName}</td>
                      </tr>
                    `
                        : ""
                    }
                    
                    ${
                      result.businessEmail
                        ? `
                      <tr>
                        <td class="info-label">Business Email</td>
                        <td class="info-value">${result.businessEmail}</td>
                      </tr>
                    `
                        : ""
                    }
                    
                    ${
                      result.mobileNumber
                        ? `
                      <tr>
                        <td class="info-label">Mobile Number</td>
                        <td class="info-value">${result.mobileNumber}</td>
                      </tr>
                    `
                        : ""
                    }
                    
                    ${
                      result.country
                        ? `
                      <tr>
                        <td class="info-label">Country</td>
                        <td class="info-value">${result.country}</td>
                      </tr>
                    `
                        : ""
                    }
                    
                    ${
                      result.message
                        ? `
                      <tr>
                        <td class="info-label">Message</td>
                        <td class="info-value">${result.message}</td>
                      </tr>
                    `
                        : ""
                    }
                    
                    ${
                      result.source
                        ? `
                      <tr>
                        <td class="info-label">Source</td>
                        <td class="info-value">${result.source}</td>
                      </tr>
                    `
                        : ""
                    }
                  </table>
                </div>
                
                <div class="footer">
                  <p>This is an automated message. Please do not reply to this email.</p>
                </div>
              </div>
            </body>
          </html>
          `,
        });
        console.log("Successfully sent team notification email");
        return true;
      } catch (error) {
        console.error("Failed to send team notification email:", {
          error: error.message,
          stack: error.stack,
          submission: {
            name: result.fullName,
            email: result.businessEmail,
            timestamp: new Date().toISOString(),
          },
        });
        return false;
      }
    };

    // Function to send user acknowledgment email
    const sendUserAcknowledgment = async () => {
      if (!result.businessEmail) {
        console.log(
          "No business email provided, skipping acknowledgment email"
        );
        return false;
      }

      try {
        console.log(
          `Sending acknowledgment email to user: ${result.businessEmail}`
        );
        await strapi.plugins["email"].services.email.send({
          to: result.businessEmail,
          from: "contact@univdatos.com",
          subject: "Thank You for Contacting UnivDatos",
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Thank You for Contacting Us</title>
                <style>${emailStyles}</style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <img src="${logoUrl}" alt="UnivDatos" class="logo">
                  </div>
                  
                  <div class="content">
                    <h1 class="submission-title">Thank You for Contacting Us</h1>
                    
                    <p class="message-text">Dear ${result.fullName},</p>
                    
                    <p class="message-text">Thank you for reaching out to UnivDatos. We have received your inquiry and our team will review it promptly.</p>
                    
                    <p class="message-text">We aim to respond to all inquiries within 24-48 business hours.</p>
                    
                    <p class="message-text">Best regards,<br>The UnivDatos Team</p>
                  </div>
                  
                  <div class="footer">
                    <p>© 2025 UnivDatos. All rights reserved. | Email: contact@univdatos.com | Phone: +1 978 733 0253</p>
                  </div>
                </div>
              </body>
            </html>
          `,
        });
        console.log("Successfully sent acknowledgment email to user");
        return true;
      } catch (error) {
        console.error("Failed to send user acknowledgment email:", {
          error: error.message,
          stack: error.stack,
          recipient: result.businessEmail,
          timestamp: new Date().toISOString(),
        });
        return false;
      }
    };

    // Send both emails independently
    const results = await Promise.allSettled([
      sendTeamNotification(),
      sendUserAcknowledgment(),
    ]);

    // Log overall results
    const [teamEmailResult, userEmailResult] = results;
    console.log("Email sending completed with results:", {
      teamNotification:
        teamEmailResult.status === "fulfilled" ? "success" : "failed",
      userAcknowledgment:
        userEmailResult.status === "fulfilled" ? "success" : "failed",
      timestamp: new Date().toISOString(),
      submissionId: result.id,
    });

    // Optionally, you could store the email sending status in your database
    try {
      await strapi
        .query("api::callback-form-submission.callback-form-submission")
        .update({
          where: { id: result.id },
          data: {
            emailStatus: {
              teamNotificationSent: teamEmailResult.status === "fulfilled",
              userAcknowledgmentSent: userEmailResult.status === "fulfilled",
              timestamp: new Date().toISOString(),
            },
          },
        });
    } catch (error) {
      console.error("Failed to update submission with email status:", error);
    }
  },
};
