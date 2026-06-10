const express = require("express");
const app = express();
// Initializes express-ws
const socket = require("express-ws")(app); 

app.use(function(req, res, next){
    console.log("middleware");
    req.testing = "testing";
    return next();
});

app.get("/", function(req, res, next){
    console.log("hello " + req.testing);
    res.end();
});

app.ws('/', function(ws, req) {
    console.log('socket', req.testing);
    ws.on('message', function(msg) {
        console.log(msg);
    });
});

app.listen(3000, () => console.log("Server live on 3000"));