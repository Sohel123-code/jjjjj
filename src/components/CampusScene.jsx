import { useEffect, useRef } from 'react';

export default function CampusScene({ onExplore }) {
  const stageRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    let destroy;
    import('../lib/campus.js').then(({ createCampus }) => {
      if (!cancelled) destroy = createCampus(stageRef.current);
    }).catch(() => {
      if (!cancelled) {
        stageRef.current.classList.add('fallback-mode');
        stageRef.current.querySelector('.scene-fallback').hidden = false;
      }
    });
    return () => { cancelled = true; destroy?.(); };
  }, []);
  return (      <div className="campus-stage" id="campus-stage" ref={stageRef} aria-label="Interactive 3D model of an illustrative college campus">
        <div className="campus-top-label"><span className="status-dot"></span> INSIDE YOUR POLYGON <span className="demo-label">DEMO CAMPUS</span></div>
        <div id="campus-canvas" role="img" aria-label="A 3D miniature campus with academic buildings, trees, a sports court and a green polygon boundary"></div>
        <div className="scene-fallback" hidden><img src="assets/polygon-brand.png" alt="Illustration of the Polygon campus community" /></div>
        <button className="map-pin pin-library" onClick={() => onExplore("library")} aria-label="Explore the library"><span>▤</span><small>The library</small></button>
        <button className="map-pin pin-cafe" onClick={() => onExplore("cafe")} aria-label="Explore the student commons"><span>☕</span><small>Student commons</small></button>
        <div className="floating-note"><span className="note-icon">↺</span><div><strong>Lost it? Let’s find it.</strong><span>A little closer to being reunited.</span></div><span className="note-spark">✦</span></div>
        <div className="scene-bottom"><span><i></i> A boundary that brings us together.</span><div className="scene-controls"><button id="rotate-campus" aria-label="Rotate campus left">↶</button><button id="reset-campus" aria-label="Reset campus view">⌖</button></div></div>
        <div className="scene-hint">DRAG TO EXPLORE <span>·</span> SCROLL TO DISCOVER</div>
      </div>
);
}
