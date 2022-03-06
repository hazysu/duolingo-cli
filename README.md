# Duolingo-CLI

This is an unofficial CLI (Command Line Interface) Duolingo client, so you can practice Duolingo without leaving your terminal.

## Installation

You can install duolingo-cli with:

```sh
npm install -g duolingo 
```

## Usage

After installing, you can use it through the command ``duolingo``.

To log out of duolingo-cli, use the command ``duolingo logout``.

## Changelog

#### Version 0.1.3

- fixed bug caused by duolingo-cli accidentally being hard-coded to assume lessons were in German

#### Version 0.1.2

- credentials no longer saved in current working directory
- added ability to log out of Duolingo by deleting credentials

#### Version 0.1.1

Made public NPM module.

#### Version 0.1.0

This is the first public version of Duolingo-CLI, and the first version to work.

Features:

- Logging into Duolingo
- Saving login information locally to prevent needing to log in more than once
- Read tips provided by Duolingo to help improve your understanding
- Do lessons in the terminal
- Your XP and the SkillTree update on the website when you complete skills in the terminal
