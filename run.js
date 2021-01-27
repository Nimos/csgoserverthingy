const express = require('express')
const app = express()
const port = 3000
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser');
const fs = require('fs');
const Rcon = require('srcds-rcon');
const { exec } = require("child_process");
const settings = require('./settings.js');
const { cfgvars } = require('./settings.js');



/* other constants */
const constants = {
    readonly_cvars: ["sv_password"],
    special_commands: {
        "restart": restartServer
    }
}


/* Initiate Express and Rcon */
app.use(express.static('static'));
app.use(cookieParser(settings.cookiesSecret))
app.use(bodyParser.urlencoded());


app.listen(port, () => {
    console.log(`listening at http://localhost:${port}`)
  });
  

let rcon = Rcon({
    address: settings.server_ip,
    password: settings.rcon_password
});



/* 
    Index page 
*/
app.get('/', function(req, res){
    res.sendFile(__dirname + '/templates/index.html');
});

/* 
    Server status
*/
app.get('/serverstatus', async function(req, res){
    if (req.signedCookies.token !== "isLoggedIn") {
        res.send({ sucess: false, msg: "Please log in" });
        return;
    }

    let status;
    try {
        status = await getServerStatus();
    } catch (e) {
        status = "Unable to retrieve server status: " + e;
    }
    res.send(status);
});

/* 
    Switch to a new config file 
*/
app.post('/switch', (req, res) => {
    if (req.signedCookies.token !== "isLoggedIn") {
        res.send({ sucess: false, msg: "Please log in" });
        return;
    }

    fs.copyFileSync(settings.target, settings.backup_dir + "/" + "backup" + (new Date()).getTime() + ".cfg");
    fs.copyFileSync(settings.configs_dir + "/" + req.body.name, settings.target);

    res.send({ success: true });
})

/*
    Change a CVar via Rcon
*/
app.post('/changecvar', async (req, res) => {
    if (req.signedCookies.token !== "isLoggedIn") {
        res.send({ sucess: false, msg: "Please log in" });
        return;
    }

    let name = req.body.name;
    let value = req.body.value;

    if (!settings.convars.includes(name)) {
        res.send({ success: false, msg: `${name} is not in ${settings.convars}` });
        return;
    } else if (constants.readonly_cvars.includes(name)) {
        res.send({ success: false, msg: `${name} is read only` });
        return;
    } else {
        await setCvar(name, value);

        res.send({ success: true });
    }
})

/*
    Change a CVar in the Config file
*/
app.post('/changecfgvar', async (req, res) => {
    if (req.signedCookies.token !== "isLoggedIn") {
        res.send({ sucess: false, msg: "Please log in" });
        return;
    }

    let name = req.body.name;
    let value = req.body.value;

    if (!settings.cfgvars.includes(name)) {
        res.send({ success: false, msg: `${name} is not in ${settings.cfgvars}` });
        return;
    } else {
        await setConfigVar(name, value);

        res.send({ success: true });
    }
})

/*
    Change a line in the active config file
*/
app.post('/changecfgvar', (req, res) => {
    if (req.signedCookies.token !== "isLoggedIn") {
        res.send({ sucess: false, msg: "Please log in" });
        return;
    }

    let name = req.body.name;
    let value = req.body.value;

    if (!settings.cfgvars.includes(name)) {
        res.send({ success: false, msg: `${name} is not in ${settings.cfgvars}` });
        return;
    } else {
        setConfigVar(name, value);

        res.send({ success: true });
    }
});

/*
    Login and retreive status information
*/
app.post('/login', async (req, res) => {

    if (req.body.password !== settings.password && req.signedCookies.token !== "isLoggedIn") {
        res.send({ success: false });
        return;
    }
    console.log("New login...")
    res.cookie('token', 'isLoggedIn', {signed: true})

    let files = [];

    console.log("Getting server status...")
    let status;
    try {
        status = await getServerStatus();
    } catch (e) {
        status = "Unable to retrieve server status: "
        status += e;
        console.log(status)
    }
    
    let cvars;
    console.log("Getting live variables...")
    try {
        cvars = await getVars(settings.convars);
    } catch (e) {
        status += "\nUnable to retrieve live variables: " + e;
        cvars = [];
        console.log("Unable to retrieve live variables: " + e);
    }

    let config;
    console.log("Getting config file...")
    try {
        config = getCfgVars(settings.cfgvars);
    } catch (e) {
        console.log("Unable to open config file: " + e)
        status += "\nUnable to open config file: " + e;
    }
    let actions = settings.commands;

    let password = cvars.find(obj => obj.name == "sv_password");
    if (!password) {
        password = config.find(obj => obj.name == "sv_password");
    } 

    if (!password) {
        password = "";
    } else {
        password = password.value;
    }

    let connectLink = `steam://connect/${settings.public_ip ? settings.public_ip : settings.server_ip}/${password}`; 

    console.log("Login finished, sending data...");
    res.send({ success: true, configs: files, status: status, cvars: cvars, config: config, actions: actions, connect_link: connectLink });
})

/*
    Run a command from the whitelist in the settings object
*/
app.post('/runcommand', async (req, res) => {
    if (req.signedCookies.token !== "isLoggedIn") {
        res.send({ sucess: false, msg: "Please log in" });
        return;
    }

    let name = req.body.name;

    if (!settings.commands.map(a => a.name).includes(name)) {
        res.send({ success: false, msg: `${name} is not in ${settings.commands.map(a => a.name)}` });
        return;
    } else {
        if (constants.special_commands[name]) {
            result = await constants.special_commands[name]();
        } else {
            result = rcon.command(name);
        }

        res.send({ success: true, output: result });
    }
});


/*
    Runs the servers run script to restart
*/
function restartServer() {
    return new Promise((resolve, reject) => {
        exec(settings.csgoserver_runscript + " restart", (error, stdout, stderr) => {
            let output = "";
            if (error) {
                output += "ERROR: " + error.message + "\n"; 
            } 

            if (stderr) {
                output += "stderr: " + stderr + "\n";
            }

            output += stdout;

            resolve(output);
        });
    })
}

/*
    Runs the rcon status command and returns the result
*/
async function getServerStatus() {
    await rcon.connect()
    let status = await rcon.command('status');

    return status;
}

/*
    Gets the live values of a list of cvars
*/
async function getVars(names) {   
    let vars = [];

    try {
        await rcon.connect();
        for (let name of names) {
            let r = await getVar(name);
            vars.push({
                name: r[0],
                value: r[1],
                readonly: constants.readonly_cvars.includes(name)
            });
        }
    } catch (e) {
        throw e;
    }
    
    return vars;
}

/*
    Gets the live value of a cvar
*/
async function getVar(name) {

    try {
        let result = await rcon.command('cvarlist ' + name, 500);

        result = result.split("\n");
        result = result[2];
        result = result.split(":");
        return [result[0].trim(), result[1].trim()];
    } catch (e) {
        return [];
    }
}

/*
    Sets the value of a cvar on the server
*/
function setCvar(name, value) {
    let command = name + " \"" + value + "\"";
    console.log("rcon " + command)
    return rcon.connect().then(() => rcon.command(command)).catch((e) => console.log("error setting cvar", e));
}

/*  
    Gets the values of a list of cvars from the config file
*/
function getCfgVars(names) {
    let config = fs.readFileSync(settings.config_file, "utf8");

    config = config.split("\n");

    let vars = [];

    for (line of config) {
        if (line[0] == "/" && line[1] == "/") {
            continue;
        }
        lineSplit = line.split(" ");

        let name = lineSplit[0];

        if (!names.includes(name)) {
            continue;
        }
        
        let value = "";
        if (lineSplit[1][0] == "\"") {
            value = line.split("\"")[1];
        } else {
            value = lineSplit[1];
        }

        vars.push({
            name: name,
            value: value
        });
    }

    return vars;
}

/* 
    Sets the values of a list of cvars 
*/
function setConfigVar(target, value) {
    let config = fs.readFileSync(settings.config_file, "utf8");

    config = config.split("\n");

    let vars = {};

    for (let i = 0; i < config.length; i++) {
        let line = config[i];
        
        if (line[0] == "/" && line[1] == "/") {
            continue;
        }
        lineSplit = line.split(" ");

        let name = lineSplit[0];

        if (name == target) {
            if (isNaN(value)) {
                value = '"' + value + '"';
            }

            config[i] = name + " " + value;
            break;
        }
    }

    config = config.join("\n");

    fs.writeFileSync(settings.config_file, config);   
}
