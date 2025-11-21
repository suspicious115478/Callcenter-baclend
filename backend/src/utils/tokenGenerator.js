// tokenGenerator.js
// Dummy WebRTC token generator (replace with Twilio/Exotel APIs later)

exports.generateVoiceToken = (agentId) => {
  // In production, generate a JWT or provider-based token.
  return {
    token: "dummy-webrtc-token-" + agentId,
    expiresIn: 3600
  };
};
