#!/usr/bin/env node
"use strict";process.argv[2]==="complete"?require("./completion.js"):require("./cli.js");
