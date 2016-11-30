import React, { PropTypes } from 'react';
import { connect } from 'react-redux';
import AddonScreenshot from '../../res/gecko-profiler-screenshot-2016-11-29.png';

require('./Home.css');

const Home = ({ className, profilerUrl }) => {
  return (
    <div className={className}>
      <section className={`${className}-text`}>
        <h1>Cleopatra - UI for the Gecko Profiler</h1>
        <p>Welcome to cleopatra. You can look at profiles here.</p>
        <p>
          Capture profiles using the <a href={profilerUrl}>new version of the
          gecko profiler addon</a>. You can control the profiler with the following two
          shortcuts:
        </p>
        <ul>
          <li><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>5</kbd>: Stop / Restart profiling</li>
          <li><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>6</kbd>: Capture the profile and open up this interface.</li>
        </ul>
        <p><img src={AddonScreenshot} style={{ width: '393px', height: '216px' }}/></p>
      </section>
    </div>
  );
};

Home.propTypes = {
  className: PropTypes.string.isRequired,
  profilerUrl: PropTypes.string.isRequired,
};

export default connect(() => ({
  className: 'home',
  profilerUrl: 'https://github.com/mstange/Gecko-Profiler-Addon/tree/for-cleopatra-react',
}))(Home);
