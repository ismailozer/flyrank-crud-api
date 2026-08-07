const supabase = require('./supabaseClient');

function extractBearerToken(req) {
  const authorization = req.headers.authorization;

  if (typeof authorization !== 'string') {
    return null;
  }

  const parts = authorization.trim().split(/\s+/);

  if (
    parts.length !== 2 ||
    parts[0].toLowerCase() !== 'bearer' ||
    parts[1].trim() === ''
  ) {
    return null;
  }

  return parts[1];
}

async function requireAuth(req, res, next) {
  const token = extractBearerToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'Access token required',
    });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({
        error: 'Invalid or expired token',
      });
    }

    req.user = data.user;
    req.accessToken = token;

    next();
  } catch (error) {
    console.error('Authentication failed:', error);

    return res.status(401).json({
      error: 'Invalid or expired token',
    });
  }
}

module.exports = requireAuth;