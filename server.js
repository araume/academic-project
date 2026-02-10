const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { loadEnv } = require('./server/config/env');

loadEnv();

const authRoutes = require('./server/routes/auth');
const libraryRoutes = require('./server/routes/library');
const postsRoutes = require('./server/routes/posts');
const profileRoutes = require('./server/routes/profile');
const personalRoutes = require('./server/routes/personal');
const requireAuth = require('./server/middleware/requireAuth');
const { getSession } = require('./server/auth/sessionStore');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/src/styles', express.static(path.join(__dirname, 'src', 'styles')));
app.use('/src/js', express.static(path.join(__dirname, 'src', 'js')));

app.use(authRoutes);
app.use(libraryRoutes);
app.use(postsRoutes);
app.use(profileRoutes);
app.use(personalRoutes);

app.get('/', (req, res) => {
  const session = req.cookies.session_id ? getSession(req.cookies.session_id) : null;
  return res.redirect(session ? '/home' : '/login');
});

app.get('/login', (req, res) => {
  const session = req.cookies.session_id ? getSession(req.cookies.session_id) : null;
  if (session) {
    return res.redirect('/home');
  }
  res.sendFile(path.join(__dirname, 'src', 'login.html'));
});

app.get('/home', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'home.html'));
});

app.get('/connections', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'pages', 'connections.html'));
});

app.get('/personal', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'pages', 'personal.html'));
});

app.get('/open-library', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'pages', 'open-library.html'));
});

app.get('/community', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'pages', 'community.html'));
});

app.get('/rooms', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'pages', 'rooms.html'));
});

app.get('/profile', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'pages', 'profile.html'));
});

app.get('/account', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'pages', 'account.html'));
});

app.get('/faq', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'pages', 'faq.html'));
});

app.get('/about', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'pages', 'about.html'));
});

app.get('/preferences', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'pages', 'preferences.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
