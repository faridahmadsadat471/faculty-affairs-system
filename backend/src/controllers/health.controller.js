export function getHealth(req, res) {
  res.status(200).json({
    status: 'ok',
    message: 'Faculty Affairs API is running',
  });
}
