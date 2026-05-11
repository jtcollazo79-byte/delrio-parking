const https = require('https');

// Try listing with token - first get auth
const postData = JSON.stringify({ returnSecureToken: true });
const key = 'AIzaSyAo8THlHjdaA-B5DoZgAg4xUySy85MYzOo';

const opts = {
  hostname: 'identitytoolkit.googleapis.com',
  path: '/v1/accounts:signInAnonymously?key=' + key,
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
};
const req = https.request(opts, (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    try {
      const a = JSON.parse(d);
      if (!a.idToken) { console.log('No token:', d.substring(0,300)); return; }
      const token = a.idToken;
      console.log('Auth OK, checking Storage...');
      
      // List storage objects with auth
      const surl = 'https://firebasestorage.googleapis.com/v0/b/del-rio-parking.firebasestorage.app/o?prefix=photos/&maxResults=20';
      const sopts = {
        hostname: 'firebasestorage.googleapis.com',
        path: '/v0/b/del-rio-parking.firebasestorage.app/o?prefix=photos/&maxResults=20',
        headers: { 'Authorization': 'Firebase ' + token }
      };
      https.get(sopts, (res2) => {
        let d2 = '';
        res2.on('data', c => d2 += c);
        res2.on('end', () => {
          try {
            const j = JSON.parse(d2);
            if (j.items && j.items.length) {
              console.log('Fotos:', j.items.length);
              j.items.forEach(i => console.log(' ', i.name));
            } else { console.log('Sin fotos:', d2.substring(0,400)); }
          } catch(e) { console.log(d2.substring(0,500)); }
        });
      });
    } catch(e) { console.log(d.substring(0,500)); }
  });
});
req.write(postData);
req.end();
