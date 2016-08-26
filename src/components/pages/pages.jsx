import React from 'react';
import Nav from './nav/nav.jsx';

require('./pages.css');

export default function Pages({ children }) {
  return (
    <div className="pages">
      <div className="pages__nav">
        <Nav />
      </div>
      <div className="pages__content">
         {children}
      </div>
    </div>
  );
}

Pages.propTypes = {
  children: React.PropTypes.element.isRequired,
};

