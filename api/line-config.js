module.exports = function(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.status(200).json({ channelId: process.env.LINE_CHANNEL_ID || ‘’ });
};
