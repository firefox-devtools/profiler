# Setting up profiler on GitHub Codespaces

Instead of configuring a local setup, you can also use [GitHub Codespaces](https://github.com/features/codespaces), a cloud-based development environment with minimal setup.

## Getting Started

You can create a new Codespace directly from the repository:

1. Navigate to the [Firefox Profiler repository](https://github.com/firefox-devtools/profiler)
2. Click the green `Code` button
3. Click on the `Codespaces` tab
4. Click `Create codespace on main` (or on your branch)

GitHub will automatically:

- Create a new development environment
- Install all dependencies using `yarn install`
- Start the development server on port 4242

## Open the profiler UI in your web browser

Once the Codespace is ready, GitHub will automatically forward port 4242. You'll see a notification that a service is available on this port.

- Click `Open in Browser` to open the profiler UI in a new tab
- Alternatively, you can access forwarded ports from the `PORTS` tab at the bottom of the VS Code interface

## Load custom profiles

If you want to load profiles for development, you can follow the steps described in [Loading in profiles for development](../CONTRIBUTING.md#loading-in-profiles-for-development) section.

## Advanced usage

### Opening a specific branch or pull request

You can create a Codespace for any branch or pull request:

1. Navigate to the branch or pull request you want to work on
2. Click the `Code` button
3. Select the `Codespaces` tab
4. Click `Create codespace on [branch-name]`

### Using the GitHub CLI

You can also create and manage Codespaces using the [GitHub CLI](https://cli.github.com/):

```bash
# Create a new codespace
gh codespace create --repo firefox-devtools/profiler

# List your codespaces
gh codespace list

# Connect to a codespace
gh codespace code
```

### Configuration

The Codespace is configured using the `.devcontainer/devcontainer.json` file in the repository. This includes:

- Node.js environment
- Automatic port forwarding for port 4242
- Pre-installed VS Code extensions (ESLint, Prettier, Stylelint)
- Automatic dependency installation and server startup
