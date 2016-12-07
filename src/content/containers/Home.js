import React, { PropTypes } from 'react';
import { connect } from 'react-redux';
import AddonScreenshot from '../../../res/gecko-profiler-screenshot-2016-11-29.png';

require('./Home.css');

const InstallButton = ({ name, xpiURL, children }) => {
  return <a href={xpiURL} onClick={e => {
    if (window.InstallTrigger) {
      window.InstallTrigger.install({ [name]: xpiURL });
    }
    e.preventDefault();
  }}>{children}</a>;
}

const Home = ({ className, profilerURL }) => {
  return (
    <div className={className}>
      <section className={`${className}-text`}>
        <h1>Cleopatra - UI for the Gecko Profiler</h1>
        <p>Welcome to cleopatra. You can look at profiles here.</p>
        <p>
          Capture profiles using
          the <InstallButton name='Gecko Profiler' xpiURL={profilerURL}>new
          version of the gecko profiler addon</InstallButton>.
          You can control the profiler with the following two
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
  profilerURL: PropTypes.string.isRequired,
};

export default connect(() => ({
  className: 'home',
  profilerURL: 'https://raw.githubusercontent.com/mstange/Gecko-Profiler-Addon/master/gecko_profiler.xpi',
}))(Home);
