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
        
        .logo {
          max-width: 200px;
          height: auto;
        }
        
        .content {
          padding: 40px 30px;
          background-color: #ffffff;
        }
        
        .highlight-box {
          background-color: #f8f9fd;
          border-left: 4px solid #09184C;
          padding: 20px;
          margin: 20px 0;
        }
  
        .report-title {
          color: #09184C;
          font-size: 18px;
          margin-bottom: 15px;
          font-weight: bold;
        }
        
        .greeting {
          color: #09184C;
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 20px;
        }
        
        .message-text {
          color: #333333;
          margin: 15px 0;
          font-size: 16px;
        }
  
        .info-section {
          background-color: #f8f9fd;
          padding: 20px;
          border-radius: 8px;
          margin: 25px 0;
        }
  
        .info-title {
          color: #09184C;
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 15px;
        }
  
        .contact-info {
          color: #09184C;
          margin: 10px 0;
          font-size: 15px;
        }
  
        .divider {
          height: 1px;
          background-color: #e0e0e0;
          margin: 25px 0;
        }
        
        .footer {
          background-color: #f8f9fd;
          padding: 25px;
          text-align: center;
        }
  
        .footer-text {
          color: #666666;
          font-size: 14px;
          margin: 5px 0;
        }
        
        /* Mobile responsiveness */
        @media only screen and (max-width: 480px) {
          .container { width: 100% !important; }
          .content { padding: 20px 15px !important; }
          .highlight-box { margin: 15px 0; }
        }
      `;

    // Function to send sales team notification
    const sendSalesNotification = async () => {
      try {
        console.log("Sending notification email to sales team...");
        await strapi.plugins["email"].services.email.send({
          to: "sales2@univdatos.com",
          from: "sales2@univdatos.com",
          subject: "New Report Enquiry",
          html: `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>New Report Enquiry</title>
                  <style>${emailStyles}</style>
                </head>
                <body>
                  <div class="container">
                    <div class="header">
                      <img src="${logoUrl}" alt="UnivDatos" style="width:200px;max-width:200px;" class="logo">
                    </div>
                    
                    <div class="content">
                      <h1 class="greeting">New Report Enquiry</h1>
                      
                      <div class="highlight-box">
                      <div class="report-title">Report: ${
                        reportData ? reportData.title : "Not specified"
                      }</div>
                        <p class="message-text">Message: ${
                          result.message || "No message provided"
                        }</p>
                      </div>
  
                      <div class="info-section">
                        <h2 class="info-title">Customer Details</h2>
                        <p class="contact-info">Name: ${result.fullName}</p>
                        <p class="contact-info">Email: ${
                          result.businessEmail
                        }</p>
                        <p class="contact-info">Phone: ${
                          result.mobileNumber || "Not provided"
                        }</p>
                        <p class="contact-info">Country: ${result.country}</p>
                      </div>
                    </div>
  
                    <div class="footer">
                      <p class="footer-text">This is an internal notification. Please follow up with the customer promptly.</p>
                    </div>
                  </div>
                </body>
              </html>
            `,
        });
        console.log("Successfully sent sales team notification");
        return true;
      } catch (error) {
        console.error("Failed to send sales notification:", {
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
        await strapi.plugins["email"].services.email.send({
          to: result.businessEmail,
          from: "contact@univdatos.com",
          replyTo: "contact@univdatos.com",
          subject: "Thank You for Your Interest in UnivDatos Market Research",
          html: `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Thank You for Your Interest</title>
                  <style>${emailStyles}</style>
                </head>
                <body>
                  <div class="container">
                    <div class="header">
                      <img src="${logoUrl}" alt="UnivDatos" style="width:200px;max-width:200px;" class="logo">
                    </div>
                    
                    <div class="content">
                      <h1 class="greeting">Thank You, ${result.fullName}!</h1>
                      
                      <p class="message-text">Thank you for your interest in our market research report.</p>
  
                      <div class="highlight-box">
                      <div class="report-title">${
                        reportData ? reportData.title : "Selected Report"
                      }</div>
                        <p class="message-text">We have received your enquiry and our team will review it promptly.</p>
                      </div>
  
                      <p class="message-text">Our dedicated research team will analyze your requirements and get back to you within the next 24 business hours with detailed information about the report and pricing options tailored to your needs.</p>
  
                      <div class="info-section">
                        <h2 class="info-title">What to Expect</h2>
                        <p class="message-text">• Detailed report overview</p>
                        <p class="message-text">• Customization options</p>
                        <p class="message-text">• Pricing information</p>
                        <p class="message-text">• Sample pages (upon request)</p>
                      </div>
  
                      <div class="divider"></div>
  
                      <p class="message-text">If you have any immediate questions or need urgent assistance, please don't hesitate to contact us:</p>
                      
                      <div class="contact-info">
                        <p>Email: contact@univdatos.com</p>
                        <p>Phone: +1 978 733 0253</p>
                      </div>
  
                    </div>
  
                    <div class="footer">
                      <p class="footer-text">© 2024 UnivDatos Market Insights</p>
                      <p class="footer-text">All Rights Reserved</p>
                    </div>
                  </div>
                </body>
              </html>
            `,
        });
        console.log("Successfully sent customer acknowledgment");
        return true;
      } catch (error) {
        console.error("Failed to send customer acknowledgment:", {
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
      sendSalesNotification(),
      sendCustomerAcknowledgment(),
    ]);

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
              set: {
                salesNotificationSent: salesEmailResult.status === "fulfilled",
                customerAcknowledgmentSent:
                  customerEmailResult.status === "fulfilled",
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
