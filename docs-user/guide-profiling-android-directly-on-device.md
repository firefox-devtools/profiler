# Profiling Firefox for Android directly on device

The Firefox Profiler can be used without the remote debugging option. It offers a little less flexibility (can't edit the options and the profile is
automatically uploaded). However, it does allow you to capture a profile without the need of a PC.

## Setup

### Pick a build to profile

We recommend profiling a Firefox build from any release channel (i.e. not debug), whether downloaded from Google Play, Taskcluster, or built locally.

### Enable secret settings on the mobile device

To enable secret settings, follow these steps:

- Click on the [three dot icon next to the URL bar](./images/about-url.png)
- Select the ["Settings" option](./images/settings-menu.png).
- Scroll to the bottom of the settings page and select the "About Firefox"
- Click the "Firefox" logo 5 times. [A toast should appear at the bottom of your screen with the number of click left before unlocking the secret menu](./images/secret-menu-toast.png).
- Go back to the "Settings" screen and scroll to the bottom where you should see the ["Start Profiler" option](./images/start-profiler.png).

## Usage instructions

### To start the profiler

- Click on "Start Profiler" and you should see a dialogue appear.
- Choose one of the four options that matches the closest to what you're trying to profile.
- Click "Start Profiler" and a toast should appear with the "Profiler started" message.

### To stop the profiler

- Go back to the Settings screen
- Scroll to the bottom and you should see a "Stop profiler" option has replaced the "Start Profiler" one.
- After you click it, you should see a dialogue with a warning regarding the information contained in the profile.
- Once stopped, the URL for the profile that finished recording will be copied to your clipboard which you can then use to share.
