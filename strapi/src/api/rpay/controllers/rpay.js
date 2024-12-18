const Razorpay = require("razorpay");
const crypto = require("crypto");

module.exports = ({ strapi }) => ({
  createOrder: async (ctx) => {
    const razorpay = new Razorpay({
      key_id: strapi.config.get(
        "server.razorpay.key_id",
        process.env.RAZORPAY_KEY_ID
      ),
      key_secret: strapi.config.get(
        "server.razorpay.key_secret",
        process.env.RAZORPAY_KEY_SECRET
      ),
    });

    try {
      const { amount, currency } = ctx.request.body;

      const options = {
        amount: amount,
        currency: currency,
        receipt: "rcp1",
      };

      const order = await razorpay.orders.create(options);

      ctx.body = {
        orderId: order.id,
      };
    } catch (err) {
      console.error("Order creation error:", err);
      ctx.badRequest("Order creation error", {
        moreDetails: err.message,
      });
    }
  },

  verifyPayment: async (ctx) => {
    try {
      const { orderCreationId, razorpayPaymentId, razorpaySignature } =
        ctx.request.body;

      const keySecret = strapi.config.get(
        "server.razorpay.key_secret",
        process.env.RAZORPAY_KEY_SECRET
      );
      if (!keySecret) {
        throw new Error(
          "Razorpay key secret is not defined in environment variables."
        );
      }

      const signature = crypto
        .createHmac("sha256", keySecret)
        .update(orderCreationId + "|" + razorpayPaymentId)
        .digest("hex");

      if (signature !== razorpaySignature) {
        return ctx.badRequest("Payment verification failed", {
          isOk: false,
          moreDetails: "Signature mismatch",
        });
      }

      ctx.body = {
        message: "payment verified successfully",
        isOk: true,
      };
    } catch (err) {
      console.error("Payment verification error:", err);
      ctx.badRequest("Payment verification error", {
        moreDetails: err.message,
      });
    }
  },
});
