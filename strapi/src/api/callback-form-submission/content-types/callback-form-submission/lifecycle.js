module.exports = {
  async afterCreate(event) {
    const { result } = event;
    const logoUrl =
      "https://udsweb.s3.ap-south-1.amazonaws.com/UDS_Logo_no_BG_fa9627d31f.png";

    try {
      await strapi.plugins["email"].services.email.send({
        to: "contact@univdatos.com",
        from: "contact@univdatos.com",
        subject: "New Callback Form Submission",
        html: `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>New Callback Form Submission</title>
                <style>
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
                </style>
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
    } catch (error) {
      console.error("Error sending email:", error);
    }
  },
};
