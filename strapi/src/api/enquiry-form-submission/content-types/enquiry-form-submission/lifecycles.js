module.exports = {
  async afterCreate(event) {
    console.log("Processing new enquiry form submission");
    const { result } = event;
    const logoUrl =
      "https://udsweb.s3.ap-south-1.amazonaws.com/UDS_LOGO_White_fb96f6add9.png";

    const populatedResult = await strapi.entityService.findOne(
      "api::enquiry-form-submission.enquiry-form-submission",
      result.id,
      {
        populate: ["report"],
      }
    );

    // Fetch the complete report data if a report ID exists
    const reportData = populatedResult.report;

    // Recommended approach: Change your time ranges in Strapi
    // For complete coverage, use these two configurations:
    // 1. startTime: "00:00", endTime: "18:59"
    // 2. startTime: "19:00", endTime: "00:00"  (instead of 23:59)

    // But if you can't change the data, use this function which handles end-inclusive time ranges:
    const getActiveEmailAddresses = async () => {
      try {
        const commonConfig = await strapi.entityService.findOne(
          "api::common.common",
          1,
          {
            populate: ["emailConfig"],
          }
        );

        console.log("Common Config Fetched: ", commonConfig);

        if (!commonConfig?.emailConfig) {
          console.log("No email configuration found, using default addresses");
          return ["sales2@univdatos.com"]; // Always return default
        }

        // Get current time in IST using more robust approach
        const now = new Date();
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });

        const parts = formatter.formatToParts(now);
        let hours = "";
        let minutes = "";

        parts.forEach((part) => {
          if (part.type === "hour") hours = part.value;
          if (part.type === "minute") minutes = part.value;
        });

        // Get current minutes since midnight
        const currentTotalMinutes = parseInt(hours) * 60 + parseInt(minutes);

        // For logging
        const currentTimeString = `${hours.padStart(2, "0")}:${minutes.padStart(
          2,
          "0"
        )}`;
        console.log(
          `Current time (IST): ${currentTimeString} (${currentTotalMinutes} minutes since midnight)`
        );

        // Helper function to convert time string to minutes, handling special case for "00:00"
        const timeToMinutes = (timeStr) => {
          if (timeStr === "00:00") {
            return 0; // Midnight
          }

          if (timeStr === "24:00" || timeStr === "23:59") {
            return 24 * 60; // End of day - treat as inclusive end boundary (1440 minutes)
          }

          const [h, m] = timeStr.split(":").map((num) => parseInt(num));
          return h * 60 + m;
        };

        // Process each email config
        const activeEmails = commonConfig.emailConfig
          .filter((config) => {
            if (!config.startTime || !config.endTime || !config.email) {
              console.log(`Skipping invalid config:`, config);
              return false;
            }

            const start = config.startTime;
            // Special case: if end time is 23:59, treat it as inclusive of the whole minute
            const end = config.endTime === "23:59" ? "24:00" : config.endTime;

            const startMinutes = timeToMinutes(start);
            const endMinutes = timeToMinutes(end);

            console.log(
              `Checking ${config.email}: ${start}-${end} (${startMinutes}-${endMinutes} minutes)`
            );

            // Handle time range crossing midnight
            if (
              endMinutes < startMinutes ||
              (end === "24:00" && start !== "00:00")
            ) {
              const isActive =
                currentTotalMinutes >= startMinutes ||
                currentTotalMinutes < endMinutes; // < for exclusive end time
              console.log(`Crosses midnight - Active: ${isActive}`);
              return isActive;
            } else {
              // Regular time range (doesn't cross midnight)
              const isActive =
                currentTotalMinutes >= startMinutes &&
                currentTotalMinutes < endMinutes; // < for exclusive end time
              console.log(`Regular range - Active: ${isActive}`);
              return isActive;
            }
          })
          .map((config) => config.email);

        // Always include the default email
        const allEmails = ["sales2@univdatos.com", ...activeEmails];

        // Remove duplicates
        const uniqueEmails = [...new Set(allEmails)];
        console.log("Final email recipients:", uniqueEmails);

        return uniqueEmails;
      } catch (error) {
        console.error("Error fetching email configuration:", error);
        return ["sales2@univdatos.com"]; // Fallback on error
      }
    };

    // Outlook-friendly email styles
    const emailStyles = `
    /* MSO-specific styles */
    body {
      margin: 0;
      padding: 0;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    
    table, td {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
    }

    /* General styles */
    .ReadMsgBody { width: 100%; }
    .ExternalClass { width: 100%; }
    .ExternalClass * { line-height: 100%; }
    
    /* Outlook-specific line height fix */
    p, a, li, td, blockquote {
      mso-line-height-rule: exactly;
    }
    
    /* Mobile responsiveness */
    @media only screen and (max-width: 480px) {
      table[class="container"] { width: 100% !important; }
      td[class="content"] { padding: 20px 15px !important; }
    }
  `;

    const baseTemplate = `
      <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
      <html xmlns="http://www.w3.org/1999/xhtml">
        <head>
          <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <title>{{TITLE}}</title>
          <style type="text/css">${emailStyles}</style>
          <!--[if gte mso 9]>
          <style type="text/css">
            table {border-collapse: collapse;}
          </style>
          <![endif]-->
        </head>
        <body style="margin: 0; padding: 0;">
          <!-- Outlook requires tables for layout -->
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff;">
            <tr>
              <td align="center">
                <table class="container" border="0" cellpadding="0" cellspacing="0" width="600">
                  <!-- Header with logo -->
                  <tr>
                    <td align="center" style="background-color: #09184C; padding: 25px 0;">
                      <!--[if gte mso 9]>
                      <table align="center" border="0" cellspacing="0" cellpadding="0" width="200">
                      <tr>
                      <td align="center" valign="top" width="200">
                      <![endif]-->
                      <img src="${logoUrl}" alt="UnivDatos" width="200" style="display: block; width: 200px; max-width: 200px; height: auto;" />
                      <!--[if gte mso 9]>
                      </td>
                      </tr>
                      </table>
                      <![endif]-->
                    </td>
                  </tr>
                  
                  <!-- Content area -->
                  <tr>
                    <td class="content" style="padding: 40px 30px;">
                      {{CONTENT}}
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f8f9fd; padding: 25px; text-align: center;">
                      {{FOOTER}}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    // Function to send sales team notification
    const sendSalesNotification = async () => {
      const additionalEmails = await getActiveEmailAddresses();

      // Combine default and time-based email addresses
      const allRecipients = ["sales2@univdatos.com", ...additionalEmails];

      // Remove duplicates
      const uniqueRecipients = [...new Set(allRecipients)];
      console.log("Sending sales notification to:", uniqueRecipients);

      try {
        console.log("Sending notification email to sales team...");
        const salesContent = `
          <h1 style="color: #09184C; font-size: 24px; font-weight: bold; margin-bottom: 20px; font-family: Arial, sans-serif;">New Report Enquiry</h1>
          
          <!-- Report Details Box -->
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8f9fd; margin: 20px 0;">
            <tr>
              <td style="padding: 20px; border-left: 4px solid #09184C;">
                <p style="color: #09184C; font-size: 18px; margin-bottom: 15px; font-weight: bold; font-family: Arial, sans-serif;">
                  Report: ${reportData ? reportData.title : "Not specified"}
                </p>
                <p style="color: #333333; margin: 15px 0; font-size: 16px; font-family: Arial, sans-serif;">
                  Message: ${result.message || "No message provided"}
                </p>
              </td>
            </tr>
          </table>

          <!-- Customer Details Box -->
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8f9fd; border-radius: 8px; margin: 25px 0;">
            <tr>
              <td style="padding: 20px;">
                <h2 style="color: #09184C; font-size: 18px; font-weight: bold; margin-bottom: 15px; font-family: Arial, sans-serif;">Customer Details</h2>
                <p style="color: #09184C; margin: 10px 0; font-size: 15px; font-family: Arial, sans-serif;">Name: ${
                  result.fullName
                }</p>
                <p style="color: #09184C; margin: 10px 0; font-size: 15px; font-family: Arial, sans-serif;">Email: ${
                  result.businessEmail
                }</p>
                <p style="color: #09184C; margin: 10px 0; font-size: 15px; font-family: Arial, sans-serif;">Phone: ${
                  result.mobileNumber || "Not provided"
                }</p>
                <p style="color: #09184C; margin: 10px 0; font-size: 15px; font-family: Arial, sans-serif;">Country: ${
                  result.country
                }</p>
              </td>
            </tr>
          </table>
        `;

        const salesFooter = `
          <p style="color: #666666; font-size: 14px; margin: 5px 0; font-family: Arial, sans-serif;">
            This is an internal notification. Please follow up with the customer promptly.
          </p>
        `;

        const salesEmailHtml = baseTemplate
          .replace("{{TITLE}}", "New Report Enquiry")
          .replace("{{CONTENT}}", salesContent)
          .replace("{{FOOTER}}", salesFooter);

        await strapi.plugins["email"].services.email.send({
          to: uniqueRecipients.join(","),
          from: "sales2@univdatos.com",
          subject: "New Report Enquiry",
          html: salesEmailHtml,
        });

        console.log("Successfully sent sales team notification");
        return true;
      } catch (error) {
        console.error("Failed to send sales notification:", error);
        return false;
      }
    };

    // Function to send customer acknowledgment
    const sendCustomerAcknowledgment = async () => {
      if (!result.businessEmail) {
        console.log("No business email provided, skipping acknowledgment");
        return false;
      }

      try {
        console.log(
          `Sending acknowledgment to customer: ${result.businessEmail}`
        );

        const customerContent = `
          <h1 style="color: #09184C; font-size: 24px; font-weight: bold; margin-bottom: 20px; font-family: Arial, sans-serif;">
            Thank You, ${result.fullName}!
          </h1>
          
          <p style="color: #333333; margin: 15px 0; font-size: 16px; font-family: Arial, sans-serif;">
            Thank you for your interest in our market research report.
          </p>

          <!-- Report Details Box -->
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8f9fd; margin: 20px 0;">
            <tr>
              <td style="padding: 20px; border-left: 4px solid #09184C;">
                <p style="color: #09184C; font-size: 18px; margin-bottom: 15px; font-weight: bold; font-family: Arial, sans-serif;">
                  ${reportData ? reportData.title : "Selected Report"}
                </p>
                <p style="color: #333333; margin: 15px 0; font-size: 16px; font-family: Arial, sans-serif;">
                  We have received your enquiry and our team will review it promptly.
                </p>
              </td>
            </tr>
          </table>

          <p style="color: #333333; margin: 15px 0; font-size: 16px; font-family: Arial, sans-serif;">
            Our dedicated research team will analyze your requirements and get back to you within the next 24 business hours with detailed information about the report and pricing options tailored to your needs.
          </p>

          <!-- What to Expect Box -->
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8f9fd; border-radius: 8px; margin: 25px 0;">
            <tr>
              <td style="padding: 20px;">
                <h2 style="color: #09184C; font-size: 18px; font-weight: bold; margin-bottom: 15px; font-family: Arial, sans-serif;">
                  What to Expect
                </h2>
                <p style="color: #333333; margin: 10px 0; font-size: 16px; font-family: Arial, sans-serif;">• Detailed report overview</p>
                <p style="color: #333333; margin: 10px 0; font-size: 16px; font-family: Arial, sans-serif;">• Customization options</p>
                <p style="color: #333333; margin: 10px 0; font-size: 16px; font-family: Arial, sans-serif;">• Pricing information</p>
                <p style="color: #333333; margin: 10px 0; font-size: 16px; font-family: Arial, sans-serif;">• Sample pages (upon request)</p>
              </td>
            </tr>
          </table>

          <table border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="padding: 25px 0; border-top: 1px solid #e0e0e0;">
                <p style="color: #333333; margin: 15px 0; font-size: 16px; font-family: Arial, sans-serif;">
                  If you have any immediate questions or need urgent assistance, please don't hesitate to contact us:
                </p>
                <p style="color: #09184C; margin: 10px 0; font-size: 15px; font-family: Arial, sans-serif;">
                  Email: contact@univdatos.com<br/>
                  Phone: +1 978 733 0253
                </p>
              </td>
            </tr>
          </table>
        `;

        const customerFooter = `
          <p style="color: #666666; font-size: 14px; margin: 5px 0; font-family: Arial, sans-serif;">
            © 2025 UnivDatos Market Insights<br/>
            All Rights Reserved
          </p>
        `;

        const customerEmailHtml = baseTemplate
          .replace("{{TITLE}}", "Thank You for Your Interest")
          .replace("{{CONTENT}}", customerContent)
          .replace("{{FOOTER}}", customerFooter);

        await strapi.plugins["email"].services.email.send({
          to: result.businessEmail,
          from: "contact@univdatos.com",
          replyTo: "contact@univdatos.com",
          subject: "Thank You for Your Interest in UnivDatos Market Research",
          html: customerEmailHtml,
        });

        console.log("Successfully sent customer acknowledgment");
        return true;
      } catch (error) {
        console.error("Failed to send customer acknowledgment:", error);
        return false;
      }
    };

    // Send both emails independently
    const results = await Promise.allSettled([
      sendSalesNotification(),
      sendCustomerAcknowledgment(),
    ]);

    // Log overall results
    // Log overall results
    const [salesEmailResult, customerEmailResult] = results;
    console.log("Email sending completed:", {
      salesNotification: salesEmailResult.status === "fulfilled",
      customerAcknowledgment: customerEmailResult.status === "fulfilled",
      timestamp: new Date().toISOString(),
      submissionId: result.id,
    });

    // Update submission status in database
    try {
      await strapi.entityService.update(
        "api::enquiry-form-submission.enquiry-form-submission",
        result.id,
        {
          data: {
            emailStatus: {
              salesNotificationSent: salesEmailResult.status === "fulfilled",
              customerAcknowledgmentSent:
                customerEmailResult.status === "fulfilled",
              timestamp: new Date().toISOString(),
            },
          },
        }
      );
    } catch (error) {
      console.error("Failed to update submission status:", error);
    }
  },
};
