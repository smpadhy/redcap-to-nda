const {app, BrowserWindow, ipcMain, Menu} = require('electron')
const path = require('path')
const url = require('url')
const Store = require('electron-store');
const store = new Store();

module.paths.push(path.resolve('node_modules'));
module.paths.push(path.resolve('../node_modules'));
module.paths.push(path.resolve(__dirname, '..', '..', '..', '..', 'resources', 'app', 'node_modules'));
module.paths.push(path.resolve(__dirname, '..', '..', '..', '..', 'resources', 'app.asar', 'node_modules'));

var request = require('request');
var fs = require('fs');
var async = require("async");


// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win
let setupDialog
let datadicationary
let instrumentLabels
let token
let event
let instrumentEventMapping

function createWindow () {
  // Create the browser window.
  win = new BrowserWindow({width: 1100, height: 650, "webPreferences" : { devTools: false } });

  // and load the index.html of the app.
  win.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  var template = [{
    label: "Application",
    submenu: [
        { label: "About Application", selector: "orderFrontStandardAboutPanel:" },
        { type: "separator" },
        { label: "Quit", accelerator: "Command+Q", click: function() { app.quit(); }}
    ]}, {
    label: "Edit",
    submenu: [
        { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
        { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
        { type: "separator" },
        { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
        { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
        { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
        { label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:" }
    ]}
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  // Open the DevTools.
  //win.webContents.openDevTools()

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can alsdo put them in separate files and require them here.

ipcMain.on('openSetupDialog', function (event, arg) {
    console.log("start openSetupDialog...");
    if (setupDialog) {
        setupDialog.show();
        return;
    }
    setupDialog = new BrowserWindow({ parent: win, modal: true, show: false, titleBarStyle: 'hidden', frame: false });
    setupDialog.loadURL(url.format({
        pathname: path.join(__dirname, 'setupDialog.html'),
        protocol: 'file:',
        slashes: true
    }));
    setupDialog.once('ready-to-show', function() { setupDialog.show(); });
    console.log("done with openSetupDialog...");
    setupDialog.on('closed', function() {
        console.log("setupDialog was closed");
    });

});

ipcMain.on('closeSetupDialogCancel', function(event, arg) {
    if (setupDialog) {
        setupDialog.hide();
        console.log("closed setup DIALOG after cancel");
    }
});
ipcMain.on('closeSetupDialogOk', function(event, arg) {
    if (setupDialog) {
        setupDialog.hide();
        token = arg.token;
        event = arg.event;
        console.log("closed setup DIALOG after ok: " + token + " " + event);

        // now populate the list with the instruments
        updateInstrumentList( event );
    }
});

ipcMain.on('getEventsFromREDCap', function(event, arg) {
    var token = arg;
    console.log("get event data from REDCap...");

    getEvents( token );
    getInstrumentEventMapping( token );
    getDataDictionary( token );

    // send back to dialog
    //setupDialog.send('eventsFromREDCap', "DATA FROM REDCAP");
});

ipcMain.on('getItemsForForm', function (event, form) {
    console.log("show items for form :" + form);
    var items = [];
    for (var i = 0; i < datadictionary.length; i++) {
        var d = datadictionary[i];
        if (d['form_name'] == form)
            items.push(d);
    }

    win.send('updateItems', items);
});

// save a list of tags for this item [ { 'item': "some_item", 'tags': [ "dont-save" ] } ]
ipcMain.on('setTags', function(event, data) {

    console.log("setTags with: " + JSON.stringify(data));
    // save the tags for this item as
    for (var i = 0; i < data.length; i++) {
        var item = data[i]['item'];
        var tags = store.get('tag-' + item); // existing tags
        if (typeof tags === 'undefined') {
            tags = [];
        }
        for (var j = 0; j < data[i]['tags'].length; j++) {
            var found = false;
            for (var k = 0; k < tags.length; k++) {
                if (tags[k] == data[i]['tags'][j]) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                tags.push(data[i]['tags'][j]);
            }
        }
        // save them again
        store.set('tag-' + item, tags);
    }
});

// delete one tag per entry [ { 'item': "some_item", 'tag': "dont-save" } ]
ipcMain.on('deleteTags', function(event, data) {
    // save the tags for this item as
    for (var i = 0; i < data.length; i++) {
       var item = data[i]['item'];
       var current_tags = store.get('tag-' + item);
       var tags = [];
       if (typeof current_tags === 'undefined') {
           console.log("Error: there are no tags for item " + item + ", nothing is removed.");
           return; // we are done, nothing to remove
       }
       for (var j = 0; j < current_tags.length; j++) {
           if (data[i]['tags'].indexOf(current_tags[j]) === -1) {
               tags.push(current_tags[j]);
           }
       }
       store.set('tag-' + item, tags); // store what is left after removing the tags that should be deleted
    }
});

// returns tags for list of items [ { 'item': "some_item", 'some_other_key': "some other value" } ]
// the input will also be part of the returned array of structures (key 'data')
ipcMain.on('getTags', function(event,data) {
    var results = [];
    console.log("getTags: " + JSON.stringify(data));
    for (var i = 0; i < data.length; i++) {
        console.log("called getTags for this item: " + data[i]['item']);
        var tags = store.get( 'tag-' + data[i]['item'] );
        if (typeof tags !== 'undefined') {
            results.push( { 'tags': tags, 'item': data[i]['item'] } );
        }
    }
    win.send('updateTagValues', results);   
});

ipcMain.on('checkData', function(event, data) {
    var form = data['form'];
    console.log("check the data for this form: " + form);

    // get data for all item in this form
    var data = {
        'token': token,
        'content': 'record',
        'forms[0]': form,
        'format': 'json',
        'type': 'flat',
        'rawOrLabel': 'raw',
        'rawOrLabelHeader': 'raw',
        'exportCheckboxLabel': 'false',
        'exportSurveyFields': 'false',
        'exportDataAccessGroups': false,
        'returnFormat': 'json'
    }
    
    var headers = {
        'User-Agent':       'Super Agent/0.0.1',
        'Content-Type':     'application/x-www-form-urlencoded'
    }
    
    var url = "https://abcd-rc.ucsd.edu/redcap/api/";
    request({
        method: 'POST',
        url: url,
        form: data,
        headers: headers,
        json: true
    }, function( error, response, body) {
        if (error || response.statusCode !== 200) {
            // error case
            process.stdout.write("ERROR: could not get a response back from redcap " + error + " " + JSON.stringify(response) + "\n");
            win.send('alert', JSON.stringify(response));
            return;
        }
        console.log("getting data from REDCap done");
        data = body;
        for (var i = 0; i < datadictionary.length; i++) {
            var d = datadictionary[i];
            if (d['form_name'] == form) {
                checkItem(d['field_name'], form, data, function(result, status) {
                    win.send('showItemCheck', { item: d['field_name'], form: form, result: result, status: status });
                });
            }
        }
    });
});

ipcMain.on('checkItem', function(event, data) {
    var item = data['item'];
    var form = data['form'];
    // get data for that item
    var data = {
        'token': token,
        'content': 'record',
        'fields[0]': item,
        'format': 'json',
        'type': 'flat',
        'rawOrLabel': 'raw',
        'rawOrLabelHeader': 'raw',
        'exportCheckboxLabel': 'false',
        'exportSurveyFields': 'false',
        'exportDataAccessGroups': false,
        'returnFormat': 'json'
    }
    
    var headers = {
        'User-Agent':       'Super Agent/0.0.1',
        'Content-Type':     'application/x-www-form-urlencoded'
    }
    
    var url = "https://abcd-rc.ucsd.edu/redcap/api/";
    request({
        method: 'POST',
        url: url,
        form: data,
        headers: headers,
        json: true
    }, function( error, response, body) {
        if (error || response.statusCode !== 200) {
            // error case
            process.stdout.write("ERROR: could not get a response back from redcap " + error + " " + JSON.stringify(response) + "\n");
            win.send('alert', "Error: no response from REDCap");
            return;
        }
        checkItem( item, form, data, function(result, status) {
            win.send('showItemCheck', { item: item, form: form, result: result, status: status });
        });
    });

});

function checkEntryLength( item, l, data, callback ) {
    var result = "";
    for (var i = 0; i < data.length; i++) {
        if (data[i][item].length > l) {
            result = result + "max-length-validation [" + data[i][item].length + "/" + l + "], ";
        }
    }
    status = "good";
    if (result.length > 0) {
        status = "bad";
    } else {
        result = "no data longer than " + l;
    }

    (callback)( status + " " + result, status );
}

function checkEntryNumber( item, data, callback ) {
    var result = "";
    for (var i = 0; i < data.length; i++) {
        if (data[i][item].match(/[+-]?[0-9][.]?[0-9]/) === null) {
             result = result + "is-number-validation at " + data[i][item].length + ",";
        }
    }
    status = "good";
    if (result.length > 0) {
        status = "bad";
    } else {
        result = "no number validation";
    }

    (callback)( status + " " + result, status );
}


function checkItem( item, form, data, callback ) {
    // ask REDCap for data and check
    for (var i = 0; i < datadictionary.length; i++) {
        var d = datadictionary[i];
        if (item == d['field_name']) {
            if (d['field_type'] == "text" && d['text_validation_min'] === '' && d['text_validation_max'] === '') { // text field without validation
                // get the length for this entry
                allowedLength = 30;
                var flags = store.get('tag-' + d['field_name'])
                if (typeof flags !== 'undefined') {
                    if (flags.indexOf('long') !== -1)
                       allowedLength = 60;
                    if (flags.indexOf('huge') !== -1)
                       allowedLength = 200;
                }
                checkEntryLength(item, allowedLength, data, function(result, status) {
                    (callback)( result, status );
                    return;                    
                }); // default entry length
                return;
            }
            if (d['field_type'] == "text" && d['text_validation_min'] !== '' && d['text_validation_max'] !== '') {
                var mi = parseFloat(d['text_validation_min']);
                var ma = parseFloat(d['text_validation_max']);
                status = "good";
                result = "";
                var maxLength = 0;
                var example = '';
                for (var j = 0; j < data.length; j++) {
                    if (data[j][item].length > maxLength) {
                        maxLength =  data[j][item].length;
                        example = data[j][item];
                    }
                }
                if (maxLength > ma) {
                    status = "bad";
                    result = result + "max-length validations " + maxLength + "/"+ ma + " [" + example + "], ";
                }
                for (var j = 0; j < data.length; j++) { 
                    if (data[j][item] < mi || data[j][item] > ma) {
                        status = "bad";
                        result = result + "range validation error [" + mi + "-" + ma + "],";
                    }
                }
                (callback) ( result, status );
                return;
            }
            if (d['field_type'] == "notes") {
                (callback)( "notes fields will not be exported", "info" );
                return;
            }
            if (d['field_type'] == "number") {
                checkEntryNumber(item, data, function(result, status) {
                    (callback)( result, status );
                });
                return;
            }
        }
    }


    (callback)( "good: everything is ok with " + item, "good" );
    return;
}

ipcMain.on('exportData', function(event,data) {
    console.log("write the data to disk");
    var filename = data['filename'];
    var form = data['form'];

    // get participants for baseline event and chunk over those to get the data?
    var data = {
        'token': token,
        'content': 'record',
        'forms[0]': form,
        'fields[0]': 'id_redcap',
        'fields[1]': 'redcap_event_name',
        'fields[2]': 'nda_year_1_inclusion',
        'format': 'json',
        'type': 'flat',
        'rawOrLabel': 'raw',
        'rawOrLabelHeader': 'raw',
        'exportCheckboxLabel': 'false',
        'exportSurveyFields': 'false',
        'exportDataAccessGroups': false,
        'returnFormat': 'json'
    }
    
    var headers = {
        'User-Agent':       'Super Agent/0.0.1',
        'Content-Type':     'application/x-www-form-urlencoded'
    }
    
    var url = "https://abcd-rc.ucsd.edu/redcap/api/";
    request({
        method: 'POST',
        url: url,
        form: data,
        headers: headers,
        json: true
    }, function( error, response, body) {
        if (error || response.statusCode !== 200) {
            // error case
            process.stdout.write("ERROR: could not get a response back from redcap " + error + " " + JSON.stringify(response) + "\n");
            win.send('alert', JSON.stringify(response));
            return;
        }
        console.log("getting data from REDCap done");
        data = body;
        str = "";
        // add the header
        var keys = Object.keys(data[0]);
        var skipkeys = [];
        for ( var j = 0; j < keys.length; j++) {
            var k = keys[j];
            if (k == 'id_redcap')
                k = 'subjectkey,eventname';
            if (k == 'redcap_event_name' || k == "nda_year_1_inclusion___1" || k == (form + "_complete"))
                continue; // don't export, is grouped with id_redcap
            var flags = store.get('tag-' + k);
            if (typeof flags !== 'undefined') {
                if (flags.indexOf('remove') !== -1) {
                    skipkeys.push(k);
                    continue; // don't export this key
                }
            }
            
            str = str + k;
            if (j < keys.length-1) 
                str = str + ",";
        }
        str = str + "\n";
        for ( var i = 0; i < data.length; i++) {
            if (data[i]['nda_year_1_inclusion___1'] == "1") {
                // export this participants data
                var keys = Object.keys(data[i]);
                for ( var j = 0; j < keys.length; j++) {
                    var name = keys[j];
                    if (name == "redcap_event_name" || name == "nda_year_1_inclusion___1" || name == (form + "_complete"))
                        continue; // skip, is exported next to id_redcap
                    // skip this key if its not needed
                    if (skipkeys.indexOf(name) !== -1) {
                        continue; // don't export this key
                    }

                    var label = data[i][name];
                    label = mapValueToString(name, label);
                    label = label.replace(/\"/g, "\"\"\"");
                    if (name == "id_redcap") {
                        str = str + data[i][name] + "," + data[i]['redcap_event_name'];
                    } else {
                        str = str + "\"" + label + "\"";
                    }
                    if (j < keys.length -1)
                        str = str + ",";
                }
                str = str + "\n";
            }
        }
        fs.writeFile(filename, str, function(err) {
            if (err) {
                return console.log(err);
            }
            console.log("The file was saved...");
        });    
    });

});

// lookup an items code and return the string that represents the value
function mapValueToString(item, value) {
    var ret = value;
    if (value == "") // values are allowed to be empty
        return ret;
    for (var i = 0; i < datadictionary.length; i++) {
        var d = datadictionary[i];
        if (d['field_name'] == item && (d['field_type'] == "checkbox" || d['field_type'] == "radio")) {
            var choices = d['select_choices_or_calculations'].split("|");
            var m = {};
            for (var j = 0; j < choices.length; j++) {
                var k = choices[j].split(",")[0].trim();
                var val = choices[j].split(",")[1].trim();
                m[k] = val;
            } 
            // now apply this map
            if (typeof m[value] !== 'undefined') {
                ret = m[value];
            } else {
                ret = "ERROR: value \"" + value + "\" not in allowed range";
            }
            break;
        }
    }
    return ret;
}

ipcMain.on('exportForm', function(event, data) {
    console.log("save now form : " + data['form'] + " " + data['filename']);
    var filename = data['filename'];
    if (typeof filename == 'undefined' || filename == '') {
        return; // ignore this request if we don't have a filename to save to
    }

    // structure of the data dictionary is:
    // ElementName
    // DataType
    // Size
    // Required
    // ElementDescription
    // ValueRange NDAR*, 0 :: 1260, Asian; Hawaiian or Pacitic Islander; Black, 0::174, 0::20; 999 1;2
    // Notes
    // Aliases
    str = ""; //data['form'] + ",01";
    str = str + "ElementName,DataType,Size,Required,ElementDescription,ValueRange,Notes,Aliases\n";
    str = str + "subjectkey,GUID,,Required,The NDAR Global Unique Identifier (GUID) for research subject,NDAR*,,\n";
    str = str + "eventname,String,200,Required,The event name for which the data was collected,,,\n";
    for (var i = 0; i < datadictionary.length; i++) {
        var d = datadictionary[i];
        if (d['form_name'] == data['form']) {
            //console.log("item is: " + Object.keys(d));
            var size = "30"; // default, could be 60 or 200 as well
            var type = "String";
            var range = "";
            var notes = d['field_note'];
            if (typeof d['branching_logic'] !== 'undefined' && d['branching_logic'] !== '') {
                notes = JSON.stringify( { "notes": notes, "branching_logic": d['branching_logic'] } );
            }
            var aliases = "";
            if (typeof d['text_validation_type_or_show_slider_number'] !== 'undefined') {
                if (d['text_validation_type_or_show_slider_number'] == "integer") {
                    type = "Integer";
                    size = "";
                    var mi = "";
                    if (typeof d['text_validation_min'] !== 'undefined' && d['text_validation_min'] !== '') {
                        mi = parseInt(d['text_validation_min']);
                    }
                    var ma = "";
                    if (typeof d['text_validation_max'] !== 'undefined' && d['text_validation_max'] !== '') {
                        ma = parseInt(d['text_validation_max']);
                    }
                    if (mi !== "" && ma !== "") {
                        range = mi + " :: " + ma;
                    }
                }
                if (d['text_validation_type_or_show_slider_number'] == "datetime_dmy") {
                    type = "Date";
                }
            }
            if (d['field_type'] == "checkbox") {
                var choices = d['select_choices_or_calculations'].split("|");
                range = "";
                type = "String";
                for (var j = 0; j < choices.length; j++) {
                    range = range + choices[j].split(",")[1].trim(); // ok, save out the string instead of the value???
                    if (j < choices.length-1)
                        range = range + "; ";
                } 
                range = "\"" + range + "\"";
            }
            if (d['field_type'] == "radio") {
                var choices = d['select_choices_or_calculations'].split("|");
                range = "";
                type = "String";
                for (var j = 0; j < choices.length; j++) {
                    range = range + choices[j].split(",")[1].trim();
                    if (j < choices.length-1)
                        range = range + "; ";
                }
                range = "\"" + range + "\"";
            }
            if (d['field_type'] == "number") {
                type = "Float";
            }
            if (d['field_type'] == "number") {
                type = "Float";
            }
            if (d['field_type'] == "yesno") {
                range = "\"yes; no\"";
                type = "String";
            }
            if (d['field_type'] == "text") {
                type = "String";
            }
            if (d['field_type'] == "descriptive") {
                type = "String";
            }
            if (d['field_type'] == "notes" ) {
                type = "String";
                size = "400";
                continue; // don't export
            }
            if (type == "String" && size == '') {
                size = "30"; // default value
            }
            // check if we have a longer flag for this field_name
            var flags = store.get('tag-' + d['field_name']);
            if (typeof flags !== 'undefined') {
                if (flags.indexOf('remove') !== -1)
                    continue; // ignore this entry in the data dictionary
                if (flags.indexOf('long') !== -1)
                    size = "60"
                if (flags.indexOf('huge') !== -1)
                    size = "200"
            }

            var label = d['field_label'];
            label = label.replace(/\"/g, "\"\"");
            label = label.replace(/\r\n/g, "\n");
            //label = label.replace(/,/g,"\",\"");
            notes = notes.replace(/\"/g, "\"\"");
            notes = notes.replace(/\r\n/g, "\n");
            //notes = notes.replace(/,/g,"\",\"");
            
            str = str + d['field_name'] + "," + 
                type + "," + 
                size + "," + 
                "Recommended" + "," + 
                "\"" + label + "\"," + 
                range + "," + 
                "\"" + notes + "\"," + 
                aliases + "\n";
        }
    }

    fs.writeFile(filename, str, function(err) {
        if (err) {
            return console.log(err);
        }
        console.log("The file was saved...");
    });
});

function updateInstrumentList( event ) {
    // filter instruments instruments by event
    var instruments = [];
    var inst = Object.keys(instrumentLabels);

    for (var i = 0; i < instrumentEventMapping.length; i++) {
        if (instrumentEventMapping[i]['unique_event_name'] == event || event == "ALL") {
            // what is the correct name for this event?
            var instrument = instrumentEventMapping[i]['form'];
            var name = instrumentLabels[instrument];
            var found = false;
            for (var j = 0; j < instruments.length; j++) {
                if ( instruments[j][0] == instrument ) {
                    found = true;
                }
            }
            if (!found)
               instruments.push([ instrument, name ]);
        }
    }

    win.send('updateInstrumentList', instruments);
}

function getEvents( token ) {
    var data = {
        'token': token,
        'content': 'event',
        'format': 'json',
        'returnFormat': 'json'
    }
    
    var headers = {
        'User-Agent':       'Super Agent/0.0.1',
        'Content-Type':     'application/x-www-form-urlencoded'
    }
    
    var url = "https://abcd-rc.ucsd.edu/redcap/api/";
    request({
        method: 'POST',
        url: url,
        form: data,
        headers: headers,
        json: true
    }, function( error, response, body) {
        if (error || response.statusCode !== 200) {
            // error case
            process.stdout.write("ERROR: could not get a response back from redcap " + error + " " + JSON.stringify(response) + "\n");
            return;
        }
        setTimeout( function() { setupDialog.send('eventsFromREDCap', body); }, 1000);// we might not have all the data here yet... 
    });    
}

function getInstrumentEventMapping( token ) {
    var data = {
        'token': token,
        'content': 'formEventMapping',
        'format': 'json',
        'returnFormat': 'json'
    }
    
    var headers = {
        'User-Agent':       'Super Agent/0.0.1',
        'Content-Type':     'application/x-www-form-urlencoded'
    }
    
    var url = "https://abcd-rc.ucsd.edu/redcap/api/";
    request({
        method: 'POST',
        url: url,
        form: data,
        headers: headers,
        json: true
    }, function( error, response, body) {
        if (error || response.statusCode !== 200) {
            // error case
            process.stdout.write("ERROR: could not get a response back from redcap " + error + " " + JSON.stringify(response) + "\n");
            return;
        }
        instrumentEventMapping = body;
    });
}



function getDataDictionary( token ) {
    var data = {
        'token': token,
        'content': 'metadata',
        'format': 'json',
        'returnFormat': 'json'
    }
    
    var headers = {
        'User-Agent':       'Super Agent/0.0.1',
        'Content-Type':     'application/x-www-form-urlencoded'
    }
    
    var url = "https://abcd-rc.ucsd.edu/redcap/api/";
    request({
        method: 'POST',
        url: url,
        form: data,
        headers: headers,
        json: true
    }, function( error, response, body) {
        if (error || response.statusCode !== 200) {
            // error case
            process.stdout.write("ERROR: could not get a response back from redcap " + error + " " + JSON.stringify(response) + "\n");
            return;
        }
        
        datadictionary = body;
        
        // get list of instruments
        instruments = {};
        for (var entry in datadictionary) {
            if (datadictionary[entry]['field_type'] == 'descriptive')
                continue;
            if (datadictionary[entry]['field_type'] == 'notes')
                continue;
            // find out if we have a date attached to the HIDEFROMCOMPLETION field
            var matches = datadictionary[entry]['field_annotation'].match(/HIDEFROMCOMPLETION(\d{4})(\d{2})(\d{2})/);
            if (matches !== null) {
                console.log(" HIDEFROMCOMPLETION FOUND WITH DATE! " + JSON.stringify(matches) + " for " + datadictionary[entry]['field_annotation'] + " " + JSON.stringify(datadictionary[entry]));
            } else { // we could still have a HIDEFROMCOMPLETION without a date here
                if (datadictionary[entry]['field_annotation'].indexOf("HIDEFROMCOMPLETION") !== -1)
                    continue;
            }
            if (datadictionary[entry]['field_name'] == "permission_school_records" || datadictionary[entry]['field_name'] == "permission_teacher_contact")
                continue;
            // if a variable is of type checkbox we have to replace it with the list of possible entries from the choices column
            // any one entry filled out would make this work
            var numChoices = [];
            if (datadictionary[entry]['field_type'] == 'checkbox') {
                // find out how many choices there are
                var choices = datadictionary[entry]['select_choices_or_calculations'].split("|");
                for (var i = 0; i < choices.length; i++) {
                    var c = choices[i].trim().split(",")[0].trim();
                    numChoices.push(c);
                }
            }
            if (typeof instruments[datadictionary[entry]['form_name']] == 'undefined')
                instruments[datadictionary[entry]['form_name']] = [];
            instruments[datadictionary[entry]['form_name']].push([ datadictionary[entry]['field_name'],
                                                                   datadictionary[entry]['branching_logic'],
                                                                   numChoices,
                                                                   matches!==null?matches[1] + "-" + matches[2] + "-" + matches[3]:null
                                                                 ]);
        }
        getNamesForInstrument(token);
        //process.stdout.write("Done with getting data dictionary...\n" + JSON.stringify(instruments));
    });    
}

function getNamesForInstrument( token ) {
    instrumentLabels = {};

    var data = {
        'token': token,
        'content': 'instrument',
        'format': 'json',
        'returnFormat': 'json'
    }
    
    var headers = {
        'User-Agent':       'Super Agent/0.0.1',
        'Content-Type':     'application/x-www-form-urlencoded'
    }
    
    var url = "https://abcd-rc.ucsd.edu/redcap/api/";
    request({
        method: 'POST',
        url: url,
        form: data,
        headers: headers,
        json: true
    }, function( error, response, body) {
        if (error || response.statusCode !== 200) {
            // error case
            process.stdout.write("ERROR: could not get a response back from redcap " + error + " " + JSON.stringify(response) + "\n");
            return;
        }
        data = body;
        for (var entry in data) {
            instrumentLabels[data[entry]['instrument_name']] = data[entry]['instrument_label'];     
        }
        console.log("found " + Object.keys(instrumentLabels).length + " instruments");
        // filterDataDictionary( tokens ); // remove entries from instruments again that are not part of the baseline event

        //setupDialog.send('eventsFromREDCap', "DATA FROM REDCAP 1 ");        
    });
}

function filterDataDictionary( token ) {

    var data = {
        'token': token,
        'content': 'formEventMapping',
        'format': 'json',
        'returnFormat': 'json'
    }
    
    var headers = {
        'User-Agent':       'Super Agent/0.0.1',
        'Content-Type':     'application/x-www-form-urlencoded'
    }
    
    var url = "https://abcd-rc.ucsd.edu/redcap/api/";
    request({
        method: 'POST',
        url: url,
        form: data,
        headers: headers,
        json: true
    }, function( error, response, body) {
        if (error || response.statusCode !== 200) {
            // error case
            process.stdout.write("ERROR: could not get a response back from redcap " + error + " " + JSON.stringify(response) + "\n");
            return;
        }
        data = body;
        console.log("number of instruments before filering: " + Object.keys(instruments).length);
        
        // filter out instruments that are not in the baseline event
        var okforms = [];
        for(var d in data) {
            console.log("Check event name: " + data[d]['unique_event_name'] + " for: " + data[d]['form']);
            if (data[d]['unique_event_name'] == timepoint /*'baseline_year_1_arm_1' */) {
                okforms.push(data[d]['form']);
            }
        }
        console.log("instruments to keep are: " + okforms.length + "\n" + JSON.stringify(okforms));

        for (var d in instruments) {
            if (okforms.indexOf(d) === -1) {
                console.log("remove the form: " + d);
                delete instruments[d];
            } else {
                console.log("Keep form: " + d);
            }
        }
        console.log("number of instruments left: " + Object.keys(instruments).length);
    });
}
