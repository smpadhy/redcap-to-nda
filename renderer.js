// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

// how to call a function in main?

var jQuery = require('jquery');
var {ipcRenderer, remote} = require('electron');
//console.log('ipcRenderer: ' + ipcRenderer + " " + ipcRenderer.send('giveMeSomething', 'blub'));
var main = remote.require("./main.js");
const dialog = remote.dialog;

var current_form = '';

ipcRenderer.on('calledFromMain', function(event, arg) {
    console.log("called from Main with :" + arg);
});

ipcRenderer.on('updateInstrumentList', function(event, data) {
    console.log("got instrument list : " + data);
    jQuery('#current-instrument-list').children().each(function() {
        if (jQuery(this).hasClass('fixed'))
            return true;
        jQuery(this).remove();
    });
    for (var i = 0; i < data.length; i++) {
        /*<li class="list-group-item">
         <img class="img-circle media-object pull-left" src="/assets/img/avatar2.png" width="32" height="32">
        <div class="media-body">
          <strong>List item title</strong>
          <p>Lorem ipsum dolor sit amet.</p>
        </div>
        </li> */
        jQuery('#current-instrument-list').append(
            '<li class="list-group-item" value='+ data[i][0] +'>' + 
            '<img class="img-circle media-object pull-left" src="img/instrument.png" width="32" height="32">' +
            '<div class="media-body">' +  
            '  <strong>' + data[i][0] + '</strong>' + 
            '  <p>' + data[i][1] + '</p>' +
            '</div></li>' );
        
    }
});

ipcRenderer.on('updateItems', function(event, data) {
    // console.log("show these items:" + data);
    jQuery('#current-items-list').children().remove();
    for (var i = 0; i < data.length; i++) {
        jQuery('#current-items-list').append(
            '<li class="list-group-item" value='+ data[i]['field_name'] +'>' + 
            '<img class="img-circle media-object pull-left" src="img/item.png" width="32" height="32">' +
            '<div class="media-body">' +  
            '  <strong>' + data[i]['field_name'] + '</strong>' + 
            '  <p>' + data[i]['field_label'] + '</p>' +
            '</div></li>' );
    }
    jQuery('footer h1').text(current_form + " [" + data.length + "]");
    jQuery('#export-current-form-button').prop('disabled','');
    jQuery('#check-data-button').prop('disabled','');
    jQuery('#clear-messages').prop('disabled','');
    jQuery('#export-current-form-data-button').prop('disabled','');
});

// draw the result for this item to the screen
ipcRenderer.on('showItemCheck', function(event, data) {
    var item = data['item'];
    var result = data['result'];
    var form = data['form'];
    var status = data['status'];
    var previous_item = jQuery('#message-list').find('[value="'+ item + '"]');
    if (previous_item.length > 0) {
        jQuery(previous_item).children().remove();
        jQuery(previous_item).append('<img class="img-circle media-object pull-left" src="img/' + status + '.png" width="32" height="32">' +
            '<div class="media-body">' +  
            '  <strong>' + form + " [" + item + ']</strong>' + 
            '  <p>' + result + '</p>' +
            '</div>');
    } else {
        jQuery('#message-list').append('<li class="list-group-item" value="'+ item +'" form="' + form + '">' + 
            '<img class="img-circle media-object pull-left" src="img/' + status + '.png" width="32" height="32">' +
            '<div class="media-body">' +  
            '  <strong>' + form + " [" + item + ']</strong>' + 
            '  <p>' + result + '</p>' +
            '</div></li>' );
    }
    var entry = jQuery('#message-list').find('[value="'+ item + '"]');
    jQuery('#message-list li.list-group-item').removeClass('active');
    jQuery(entry).addClass('active');
});

ipcRenderer.on('alert', function(event, data) {
    alert("Your request for checking form data failed. Most likely there is not enough memory in the server to request all the data for this form at once. Please test again using single items.\n\n\n" + data);
});

//
jQuery(document).ready(function() {

    jQuery('#open-setup-dialog').on('click', function() {
        console.log('open another dialog and get values for connectivity to REDCap');
        ipcRenderer.send('openSetupDialog', "");
        console.log("open another dialog finished");
        //jQuery("#redcap-access-token").value( "BLABLABLA" );
        setTimeout(function() {
            ipcRenderer.send('my-msg', 'hi');
        }, 3000);
    });

    jQuery('#setup-dialog-ok').on('click', function() {
        console.log("OK button click!");
        ipcRenderer.sendSync('closeSetupDialog',"");
    });

    jQuery('#instrument-search').on('keyup', function() {
        var t = jQuery(this).val();
        console.log("search list");
        jQuery('#current-instrument-list li.list-group-item').each(function(a) {
            var t1 = jQuery(this).attr('value'); // instrument
            var t2 = jQuery(this).text();
            var s = new RegExp(jQuery('#instrument-search').val(), 'i');
            if (t2.match(s) !== null) {
                jQuery(this).show();
            } else {
                jQuery(this).hide();
            }
        });
    });

    jQuery('#current-instrument-list').on('click', '.list-group-item', function() {
        console.log("click on list group item - update display: " + jQuery(this).attr('value'));
        jQuery(this).parent().children().removeClass('active');
        jQuery(this).addClass('active');
        current_form = jQuery(this).attr('value');
        ipcRenderer.send('getItemsForForm', current_form);
    });

    jQuery('#current-items-list').on('click', '.list-group-item', function() {
        var item = jQuery(this).attr('value');
        ipcRenderer.send('checkItem', { item: item, form: current_form });
    });

    jQuery('#export-current-form-button').on('click', function() {
        //var dialog = remote.require('dialog');
        dialog.showSaveDialog({ defaultPath: current_form + ".csv" }, function (filename) {
            ipcRenderer.send('exportForm', { form: current_form, filename: filename });
        });
    });

    jQuery('#export-current-form-data-button').on('click', function() {
        dialog.showSaveDialog({ defaultPath: current_form + "_data.csv" }, function (filename) {
            ipcRenderer.send('exportData', { form: current_form, filename: filename });
        });
    });

    jQuery('#check-data-button').on('click', function(){
        ipcRenderer.send('checkData', { form: current_form });
    });

    jQuery('#clear-messages').on('click', function() {
        jQuery('#message-list').children().remove();
    });

    setTimeout(function() { jQuery('#open-setup-dialog').trigger('click'); }, 500);
});