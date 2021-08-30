class Device {
    version = '';
    status = 'unknown';
    metadata = {};
    capabilities = {};
    levels = {};
}

// Create a client instance
clientId = "ui-" + Math.random();
clientId = clientId.substring(0, Math.min(23, clientId.length));
client = new Paho.MQTT.Client(
    window.location.hostname, parseInt(window.location.port), clientId);
discoveredDevices = new Map();


// set callback handlers
client.onConnectionLost = onConnectionLost;
client.onMessageArrived = onMessageArrived;

// connect the client
client.connect({
    onSuccess: onConnect,
    reconnect: true,
    cleanSession: true
});

// called when the client connects
function onConnect() {
    // Once a connection has been made, make a subscription and send a message.
    console.log("onConnect");
    //document.getElementById('no-connection').style.visibility = 'hidden';
    $('#myModal').modal('hide');
    client.subscribe("shercolor/#", {
        qos: 2
    });
}

// called when the client loses its connection
function onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
        console.log("onConnectionLost:" + responseObject.errorMessage);
        //document.getElementById('no-connection').style.visibility = 'visible';
        $('#myModal').modal('show');
    }
}

// called when a message arrives
function onMessageArrived(message) {
    console.log(`msgArrived t: ${message.destinationName} p: ${message.payloadString}`);
    let statusRegex = new RegExp('shercolor/(.+?)/status');
    let metadataRegex = new RegExp('shercolor/(.+?)/metadata');
    let capsRegex = new RegExp('shercolor/(.+?)/capabilities');
    let levelsRegex = new RegExp('shercolor/(.+?)/dispenser/levels');
    let errorRegex = new RegExp('shercolor/(.+?)/dispenser/error');

    let match = message.destinationName.match(levelsRegex);
    let deviceId = null;
    if (match !== null) {
        deviceId = match[1];
        if (!discoveredDevices.has(deviceId)) {
            discoveredDevices.set(deviceId, new Device());
        }
        discoveredDevices.get(deviceId).levels = JSON.parse(message.payloadString);
    }

    match = message.destinationName.match(errorRegex);
    if (match !== null) {
        deviceId = match[1];
        alert('Error: ' + message.payloadString);
    }

    match = message.destinationName.match(statusRegex);
    if (match !== null) {
        deviceId = match[1];
        if (!discoveredDevices.has(deviceId)) {
            discoveredDevices.set(deviceId, new Device());
        }
        discoveredDevices.get(deviceId).status = message.payloadString;
    }

    match = message.destinationName.match(metadataRegex);
    if (match !== null) {
        deviceId = match[1];
        if (!discoveredDevices.has(deviceId)) {
            discoveredDevices.set(deviceId, new Device());
        }
        discoveredDevices.get(deviceId).metadata = JSON.parse(message.payloadString);
    }

    match = message.destinationName.match(capsRegex);
    if (match !== null) {
        deviceId = match[1];
        if (!discoveredDevices.has(deviceId)) {
            discoveredDevices.set(deviceId, new Device());
        }
        discoveredDevices.get(deviceId).capabilities = JSON.parse(message.payloadString);
    }

    if (deviceId !== null) {
        updateDomTinter(deviceId);
    }

}

function updateDomTinter(deviceId) {
    if (!discoveredDevices.has(deviceId)) {
        return;
    }
    let metadata = discoveredDevices.get(deviceId).metadata;
    var tinterDiv = document.getElementById(deviceId);
    if (tinterDiv === null) {
        tinterDiv = document.getElementById('tinter-template').cloneNode(true);
        tinterDiv.getElementsByTagName('form')[0].d_deviceId.value = deviceId;
        var h1 = tinterDiv.getElementsByTagName('h1')[0];
        if (h1 !== null) {
            h1.innerHTML = `Tinter ${deviceId}`;
        }
        tinterDiv.id = deviceId;
        tinterDiv.style.visibility = 'visible';
        tinterDiv.style.display = 'block';
        document.getElementById("body").appendChild(tinterDiv)
    }

    // Metadata
    for (x of tinterDiv.getElementsByClassName("manufacturer")) {
        x.innerHTML = metadata.manufacturer;
    }
    for (x of tinterDiv.getElementsByClassName("serial")) {
        x.innerHTML = metadata.serial;
    }
    for (x of tinterDiv.getElementsByClassName("model")) {
        x.innerHTML = metadata.model;
    }

    // tinter status
    let status = discoveredDevices.get(deviceId).status;
    var statusElms = tinterDiv.getElementsByClassName("tinter-status");
    let dbutton = tinterDiv.getElementsByClassName('dispense-button')[0];
    if (dbutton !== null) {
        dbutton.disabled = true;
    }

    // Status
    for (statusElm of statusElms) {
        statusElm.innerHTML = status
        switch (status) {
            case "lost":
                statusElm.style.backgroundColor = 'red';
                break;
            case "ready":
                if (dbutton !== null) {
                    dbutton.disabled = false;
                }
                statusElm.style.backgroundColor = 'green';
                break;
            case "disconnected":
                statusElm.style.backgroundColor = 'grey';
                break;
            default:
                statusElm.style.backgroundColor = 'yellow';
                break;
        }
    }

    // metadata
    for (x of tinterDiv.getElementsByClassName("manufacturer")) {
        x.innerHTML = metadata.manufacturer;
    }
    for (x of tinterDiv.getElementsByClassName("serial")) {
        x.innerHTML = metadata.serial;
    }
    for (x of tinterDiv.getElementsByClassName("model")) {
        x.innerHTML = metadata.model;
    }

    let levels = discoveredDevices.get(deviceId).levels;
    if (levels !== null) {
        var data = [{
            x: ['Cyan', 'Magenta', 'Yellow'],
            y: [levels['cyan'], levels['magenta'], levels['yellow']],
            type: 'bar',
            marker: {
                color: ['cyan', 'magenta', 'yellow']
            }
        }];
        var layout = {
            xaxis: {
                title: 'Colorant'
            },
            yaxis: {
                title: 'Qty',
                range: [0, 1000]
            }
        };
        var plotlyDiv = tinterDiv.getElementsByClassName('plotly-chart')[0];
        Plotly.react(plotlyDiv, data, layout);
    }
}

function dispense(f) {
    let c = f.elements.d_cyan.value;
    let m = f.elements.d_magenta.value;
    let y = f.elements.d_yellow.value;

    let payload = JSON.stringify({
        "correlId": Math.random(),
        "cyan": c ? parseFloat(c) : 0,
        "magenta": m ? parseFloat(m) : 0,
        "yellow": y ? parseFloat(y) : 0
    });

    let dmsg = new Paho.MQTT.Message(payload);
    dmsg.destinationName = `shercolor/${f.elements.d_deviceId.value}/dispenser/command`;
    dmsg.retained = false;
    dmsg.qos = 2; // exactly once, no duplicate dispenses!

    client.send(dmsg);
    return false;
}