import React, { useState, useEffect } from 'react';
import { getAvatarUrl } from '../services/api';
import '../App.css';

// First letter of the name, for people without a photo.
function initialOf(name) {
  const first = Array.from(String(name ?? '').trim())[0];
  return first ? first.toUpperCase() : '?';
}

// The same name always gets the same colour.
function colorOf(name) {
  let hue = 0;
  for (const ch of String(name ?? '')) hue = (hue * 31 + ch.codePointAt(0)) % 360;
  return `hsl(${hue} 45% 42%)`;
}

// A round profile photo. `version` comes from the server (null = the user has no photo),
// it makes sure that a changed photo is loaded again and an unchanged one is not.
// Without a photo - or while it loads, or if it fails to load - a circle with the first letter is shown.
// `alt` is empty when the name is written next to the photo anyway.
function Avatar({ userId, version, name, size = 40, alt = '' }) {
  const [loaded, setLoaded] = useState({ key: null, url: null });
  const key = version == null ? null : `${userId}:${version}`;

  useEffect(() => {
    if (key === null) return undefined;

    let cancelled = false;
    getAvatarUrl(userId, version)
      .then((url) => { if (!cancelled) setLoaded({ key, url }); })
      .catch(() => { if (!cancelled) setLoaded({ key, url: null }); });
    return () => { cancelled = true; };
  }, [key, userId, version]);

  // only a photo that belongs to THIS user and THIS version is ever shown
  const url = loaded.key === key ? loaded.url : null;
  const box = { width: size, height: size };

  if (url) {
    return <img className="avatar" src={url} alt={alt} style={box} />;
  }
  return (
    <span
      className="avatar avatar-fallback"
      style={{ ...box, fontSize: size * 0.42, backgroundColor: colorOf(name) }}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      {initialOf(name)}
    </span>
  );
}

export default Avatar;
