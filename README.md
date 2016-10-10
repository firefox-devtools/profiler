![Screenshot from June 24th, 2016](./screenshot-2016-06-24.png?raw=true)


Cleopatra
=========

Cleopatra is a webpage to visualize performance profiles. It was written to be used by the Gecko Profiler but can in theory be used by any profiler that can output to JSON. The UI runs entirely client-side.

Running
=======

This is the cleopatra-react branch, which doesn't support many features at the moment. One of them is opening profiles. The only way to show profiles at the moment is to use [my `for-cleopatra-react` branch of the gecko profiler addon](https://github.com/mstange/Gecko-Profiler-Addon/tree/for-cleopatra-react).

    $ # First, make sure you have somewhat recent versions of node and npm.
    $ # Then, clone this repository and check out this branch:
    $ git clone https://github.com/mstange/cleopatra.git
    $ cd cleopatra
    $ git checkout cleopatra-react
    $ # Now, install the necessary node modules:
    $ npm install
    $ # Run webpack to process + bundle the JS, and start a local webserver at
    $ # localhost:4242:
    $ npm run start-prod

This builds and runs the production version.

Alternatively, you can run the development version. The development version is slower because it has lots of runtime checks and logging, but it has hot reloading so the development experience is a lot nicer.

To run the development version, run `npm run start` instead of `npm run start-prod`.

Once the local webserver is running, you can run Firefox with the [new version of the gecko profiler addon](https://github.com/mstange/Gecko-Profiler-Addon/tree/for-cleopatra-react). Press Ctrl+Shift+6 to capture and view the profile. The addon will capture the current profile, open a new tab, load `http://localhost:4242/`, and transfer the profile to it.
