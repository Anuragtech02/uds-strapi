module.exports = {
  routes: [
    {
      method: "POST",
      path: "/rpay/create-order",
      handler: "rpay.createOrder",
      config: {
        policies: [],
        description: "Create a new Razorpay order",
        tag: {
          plugin: "payment",
          name: "Payment",
        },
      },
    },
    {
      method: "POST",
      path: "/rpay/verify",
      handler: "rpay.verifyPayment",
      config: {
        policies: [],
        description: "Verify Razorpay payment signature",
        tag: {
          plugin: "payment",
          name: "Payment",
        },
      },
    },
  ],
};
