module.exports = {
  async afterCreate(event) {
    console.log("Processing new contact form submission");
    const logoUrl =
      "https://udsweb.s3.ap-south-1.amazonaws.com/UDS_LOGO_White_fb96f6add9.png";
    const { result } = event;

    const getActiveEmailAddresses = async () => {
      try {
        const commonConfig = await strapi.entityService.findOne(
          "api::common.common",
          1,
          {
            populate: ["emailConfig"],
          }
        );

        if (!commonConfig?.emailConfig) {
          console.log("No email configuration found, using default addresses");
          return [];
        }

        // Get current time in IST using explicit options
        const currentTimeIST = new Date().toLocaleString("en-US", {
          timeZone: "Asia/Kolkata",
          hour12: false, // Use 24-hour format
        });

        // Parse the IST time string to get hours, minutes, seconds
        const [_, time] = currentTimeIST.split(", "); // Split date and time
        const [hours, minutes, seconds] = time.split(":");

        // Format time string in HH:mm:ss format
        const currentTimeString = `${hours.padStart(2, "0")}:${minutes.padStart(
          2,
          "0"
        )}:${seconds.padStart(2, "0")}`;

        console.log(
          `Current time (IST) for email routing: ${currentTimeString}`
        );

        // Helper function to adjust only end times
        const adjustEndTime = (timeStr) => {
          const [hours, minutes, seconds] = timeStr.split(":");
          if (seconds === "00") {
            return `${hours}:${minutes}:59`;
          }
          return timeStr;
        };

        const activeEmails = commonConfig.emailConfig
          .filter((config) => {
            if (!config.startTime || !config.endTime || !config.email) {
              console.log(`Skipping invalid config:`, config);
              return false;
            }

            const start = config.startTime;
            const end = adjustEndTime(config.endTime);

            console.log(`Checking time range for ${config.email}:`);
            if (config.endTime !== end) {
              console.log(`Adjusted end time from ${config.endTime} to ${end}`);
            }
            console.log(
              `Range: ${start} to ${end} (current IST: ${currentTimeString})`
            );

            // Handle time range crossing midnight
            if (end < start) {
              const isActive =
                currentTimeString >= start || currentTimeString <= end;
              console.log(`Crosses midnight - Active: ${isActive}`);
              return isActive;
            }

            const isActive =
              currentTimeString >= start && currentTimeString <= end;
            console.log(`Regular range - Active: ${isActive}`);
            return isActive;
          })
          .map((config) => config.email);

        console.log("Active email addresses:", activeEmails);
        return activeEmails;
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
          font-family: 'Arial', sans-serif;
          line-height: 1.6;
        }
        
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
        }
        
        .header {
          text-align: center;
          padding: 25px 0;
          background-color: #09184C;
        }
        
        .logo-container {
          max-width: 200px;
          margin: 0 auto;
        }
        
        .content {
          padding: 40px 30px;
          background-color: #ffffff;
        }
        
        .title {
          color: #09184C;
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 25px;
          text-align: center;
        }
        
        .info-section {
          background-color: #f8f9fd;
          padding: 25px;
          border-radius: 8px;
          margin: 20px 0;
        }
  
        .info-label {
          color: #09184C;
          font-weight: bold;
          font-size: 15px;
          margin-bottom: 5px;
        }
  
        .info-value {
          color: #333333;
          margin-bottom: 15px;
          font-size: 15px;
        }
  
        .message-box {
          background-color: #f8f9fd;
          border-left: 4px solid #09184C;
          padding: 20px;
          margin: 25px 0;
        }
  
        .message-label {
          color: #09184C;
          font-weight: bold;
          font-size: 16px;
          margin-bottom: 10px;
        }
  
        .message-content {
          color: #333333;
          line-height: 1.6;
        }
        
        .footer {
          background-color: #f8f9fd;
          padding: 20px;
          text-align: center;
          font-size: 14px;
          color: #666666;
        }
      `;

    // Function to send notification email
    const sendNotification = async () => {
      const additionalEmails = await getActiveEmailAddresses();

      // Combine default and time-based email addresses
      const allRecipients = ["contact@univdatos.com", ...additionalEmails];

      // Remove duplicates
      const uniqueRecipients = [...new Set(allRecipients)];
      console.log("Sending contact form notification to:", uniqueRecipients);

      try {
        console.log("Sending contact form notification email...");
        await strapi.plugins["email"].services.email.send({
          to: uniqueRecipients,
          from: "contact@univdatos.com",
          subject: "New Contact Form Submission",
          html: `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>New Contact Form Submission</title>
                  <style>${emailStyles}</style>
                </head>
                <body>
                  <div class="container">
                     <div class="header">
                      <img src="${logoUrl}" alt="UnivDatos" class="logo">
                    </div>
                    
                    </div>
                    
                    <div class="content">
                      <h1 class="title">New Contact Form Submission</h1>
                      
                      <div class="info-section">
                        <p class="info-label">Full Name</p>
                        <p class="info-value">${result.fullName}</p>
  
                        <p class="info-label">Company</p>
                        <p class="info-value">${
                          result.company || "Not provided"
                        }</p>
  
                        <p class="info-label">Business Email</p>
                        <p class="info-value">${result.businessEmail}</p>
  
                        <p class="info-label">Mobile Number</p>
                        <p class="info-value">${
                          result.mobileNumber || "Not provided"
                        }</p>
  
                        <p class="info-label">Country</p>
                        <p class="info-value">${
                          result.country || "Not provided"
                        }</p>
                      </div>
  
                      <div class="message-box">
                        <p class="message-label">Message</p>
                        <p class="message-content">${
                          result.message || "No message provided"
                        }</p>
                      </div>
                    </div>
  
                    <div class="footer">
                      <p>This is an internal notification from the UnivDatos website contact form.</p>
                    </div>
                  </div>
                </body>
              </html>
            `,
        });
        console.log("Successfully sent contact form notification");
        return true;
      } catch (error) {
        console.error("Failed to send contact form notification:", {
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

    // Send email and update status
    const emailResult = await sendNotification();

    // Update submission status in database
    try {
      await strapi.entityService.update(
        "api::contact-form-submission.contact-form-submission",
        result.id,
        {
          data: {
            emailStatus: {
              set: {
                notificationSent: emailResult,
                timestamp: new Date().toISOString(),
              },
            },
          },
        }
      );
    } catch (error) {
      console.error("Failed to update submission status:", error);
    }
  },
};
