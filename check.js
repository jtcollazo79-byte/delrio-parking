const https = require('https');

// Check Storage bucket for photos (public read since rules allow read: if true)
const url = 'https://firebasestorage.googleapis.com/v0/b/del-rio-parking.firebasestorage.app/o?prefix=photos/&maxResults=20';

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const j = JSON.parse(data);
      if (j.items && j.items.length > 0) {
        console.log('Fotos en Storage:', j.items.length);
        j.items.forEach(i => console.log(' ', i.name, '-', (i.size/1024).toFixed(1) + 'KB'));
      } else {
        console.log('No hay fotos aún. Response:', data.substring(0,300));
      }
    } catch(e) { console.log(data.substring(0,500)); }
  });
}).on('error', e => console.error(e));
