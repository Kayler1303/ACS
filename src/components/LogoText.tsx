import React from 'react';

const LogoText = () => {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.25em' }}>
      <span
        className="font-serif"
        style={{ color: '#0078c6', fontSize: '1.0em', fontWeight: 'bold' }}
      >
        APARTMENT
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', position: 'relative', top: '-8px' }}>
        <span
          style={{ color: '#20bbff', fontSize: '0.42em', lineHeight: 1.1 }}
        >
          COMPLIANCE
        </span>
        <span
          style={{ color: '#20bbff', fontSize: '0.42em', lineHeight: 1.1 }}
        >
          SOLUTIONS
        </span>
      </span>
    </span>
  );
};

export default LogoText; 