rs-friendly
===============

yeah

on linux, mac, and windows (git shell):
```
    npm install -g phantomjs
    clear;RSF_U=your_username RSF_P=your_password phantomjs rsfriendly.js
```

if it gives you an ssl handshake error,
```
    clear;RSF_U=your_username RSF_P=your_password phantomjs --ignore-ssl-errors=yes rsfriendly.js
```