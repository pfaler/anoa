module.exports = {
    "extends": "airbnb",
    "installedESLint": true,
    "plugins": [
        "react"
    ],
    "rules": {
        "no-use-before-define": ["error", { "functions": false, "classes": false }]
    }
};