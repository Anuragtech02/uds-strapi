module.exports = {
  async afterCreate(event) {
    console.log("Processing new enquiry form submission");
    const { result } = event;
    const logoUrl =
      "https://udsweb.s3.ap-south-1.amazonaws.com/logo_f2f9595b81.svg";

    const populatedResult = await strapi.entityService.findOne(
      "api::enquiry-form-submission.enquiry-form-submission",
      result.id,
      {
        populate: ["report"],
      }
    );

    // SVG needs to be encoded for email clients
    const logoSvg =
      encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="37" viewBox="0 0 919 170" fill="none">
        <mask id="mask0_1029_595" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="0" y="0" width="87" height="87">
          <path d="M86.2701 0H0.100098V86.17H86.2701V0Z" fill="white"/>
        </mask>
        <g mask="url(#mask0_1029_595)">
          <path d="M126.12 108.933C123.91 108.593 121.8 108.903 119.95 109.693C117.26 110.853 114.16 110.333 112.06 108.293L108.34 104.663C105.31 101.703 103.61 97.6527 103.61 93.4227V76.2927C103.61 73.2527 104.84 70.3427 107.01 68.2227L116.68 58.7827C118.24 57.2627 120.42 56.4527 122.57 56.8027C123.83 57.0126 125.17 57.0026 126.54 56.7326C131.09 55.8326 134.69 52.0927 135.37 47.5027C136.5 39.9227 130 33.5127 122.4 34.7927C117.66 35.5827 113.9 39.5027 113.27 44.2727C113.05 45.9527 113.2 47.5727 113.65 49.0627C114.49 51.8127 113.65 54.8027 111.59 56.8227L106.78 61.5227C104.31 63.9327 100.99 65.2927 97.53 65.2927H74.16C70.2 65.2927 66.4 63.7426 63.57 60.9826L57.61 55.1627C55.75 53.3527 54.84 50.7127 55.39 48.1827C55.66 46.9327 55.73 45.6127 55.54 44.2427C54.87 39.4527 51.07 35.5427 46.3 34.7927C38.7 33.6027 32.24 40.0827 33.48 47.6827C34.26 52.4827 38.23 56.2727 43.06 56.8827C44.45 57.0627 45.8 56.9726 47.07 56.6726C49.51 56.0926 52.08 56.6727 53.87 58.4327L59.94 64.3626C63.43 67.7726 65.4 72.4426 65.4 77.3326V94.9927C65.4 99.4427 63.6 103.713 60.42 106.823L57.77 109.403C55.73 111.403 52.59 111.813 50.13 110.363C48.08 109.153 45.6 108.583 42.98 108.933C38.12 109.573 34.17 113.453 33.46 118.303C32.29 126.253 39.52 132.913 47.59 130.743C52.43 129.443 55.66 124.863 55.66 119.853V119.823C55.66 118.903 56.03 118.023 56.69 117.383L66.77 107.533C69.43 104.943 72.99 103.483 76.7 103.483H95.41C98.36 103.483 101.19 104.633 103.3 106.703L110.39 113.623C112.1 115.293 113.16 117.573 113.16 119.963C113.16 120.743 113.24 121.533 113.41 122.343C114.38 126.843 118.13 130.373 122.7 131.013C130.24 132.073 136.6 125.593 135.32 118.023C134.54 113.373 130.76 109.663 126.1 108.933H126.12Z" fill="white"/>
          <!-- Rest of the SVG paths -->
        </g>
        <!-- Rest of the SVG content -->
      </svg>`);

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

    const headerHtml = `
      <div class="header">
        <div class="logo-container">
          <img src="data:image/svg+xml,${logoSvg}" alt="UnivDatos" style="width: 200px; height: auto;">
        </div>
      </div>
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
                    ${headerHtml}
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
                    ${headerHtml}
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
                        <p>Phone: +1-4154992825</p>
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
