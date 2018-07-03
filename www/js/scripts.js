var MyVars = {
    keepTrying: true
};

$(document).ready(function () {
    //debugger;
    $('#hiddenFrame').attr('src', '');

    // Make sure that "change" event is fired
    // even if same file is selected for upload
    $("#forgeUploadHidden").click(function (evt) {
        evt.target.value = "";
    });

    $("#forgeUploadHidden").change(function (evt) {

        showProgress("Uploading file... ", "inprogress");
        var data = new FormData();
        var fileName = this.value;
        data.append(0, this.files[0]);
        $.ajax({
            url: '/dm/files',
            type: 'POST',
            headers: { 'x-file-name': fileName, 'wip-href': MyVars.selectedNode.original.href },
            data: data,
            cache: false,
            processData: false, // Don't process the files
            contentType: false, // Set content type to false as jQuery will tell the server its a query string request
            complete: null
        }).done(function (data) {
            console.log('Uploaded file "' + data.fileName + '" with urn = ' + data.objectId);

            // Refresh file tree
            //$('#forgeFiles').jstree("refresh");

            showProgress("Upload successful", "success");
        }).fail(function (xhr, ajaxOptions, thrownError) {
            alert(fileName + ' upload failed!');
            showProgress("Upload failed", "failed");
        });
    });

    var upload = $("#uploadFile").click(function (evt) {
        evt.preventDefault();
        $("#forgeUploadHidden").trigger("click");
    });

    // Get the tokens
    get3LegToken(function (token) {
        var auth = $("#authenticate");

        if (!token) {
            auth.click(signIn);
        } else {
            MyVars.token3Leg = token;

            auth.html('You\'re logged in');
            auth.click(function () {
                if (confirm("You're logged in and your token is " + token + '\nWould you like to log out?')) {
                    logoff();
                }
            });

            // Fill the tree with A360 items
            prepareFilesTree();

            // Download list of available file formats
            fillFormats();

            initializeViewer("dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLlZWTXV3QXBQUmFXQlJNT1VvRkN5RFE_dmVyc2lvbj0x");
            //initializeViewer("dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLnNwcUlHTTJEUkwyUDdrYVZ5RTlKOVE_dmVyc2lvbj0x");
        }
    });

    $('#progressInfo').click(function () {
        MyVars.keepTrying = false;
        showProgress("Translation stopped", 'failed');
    });
});

function base64encode(str) {
    var ret = "";
    if (window.btoa) {
        ret = window.btoa(str);
    } else {
        // IE9 support
        ret = window.Base64.encode(str);
    }

    // Remove ending '=' signs
    // Use _ instead of /
    // Use - insteaqd of +
    // Have a look at this page for info on "Unpadded 'base64url' for "named information" URI's (RFC 6920)"
    // which is the format being used by the Model Derivative API
    // https://en.wikipedia.org/wiki/Base64#Variants_summary_table
    var ret2 = ret.replace(/=/g, '').replace(/[/]/g, '_').replace(/[+]/g, '-');

    console.log('base64encode result = ' + ret2);

    return ret2;
}

function signIn() {
    $.ajax({
        url: '/user/authenticate',
        success: function (rootUrl) {
            location.href = rootUrl;
        }
    });
}

function logoff() {
    // Subscribe to the load event to see
    // when the LogOut page got loaded
    $('#hiddenFrame').load(function (event) {

        // Unsubscribe from event
        $("#hiddenFrame").off("load");

        // Tell the server to clear session data
        $.ajax({
            url: '/user/logoff',
            success: function (oauthUrl) {
                location.href = oauthUrl;
            }
        });
    });

    // Load the LogOut page
    $('#hiddenFrame').attr('src', 'https://accounts.autodesk.com/Authentication/LogOut');
}

function get3LegToken(callback) {

    if (callback) {
        $.ajax({
            url: '/user/token',
            success: function (data) {
                MyVars.token3Leg = data.token;
                console.log('Returning new 3 legged token (User Authorization): ' + MyVars.token3Leg);
                callback(data.token, data.expires_in);
            }
        });
    } else {
        console.log('Returning saved 3 legged token (User Authorization): ' + MyVars.token3Leg);

        return MyVars.token3Leg;
    }
}

// http://stackoverflow.com/questions/4068373/center-a-popup-window-on-screen
function PopupCenter(url, title, w, h) {
    // Fixes dual-screen position                         Most browsers      Firefox
    var dualScreenLeft = window.screenLeft != undefined ? window.screenLeft : screen.left;
    var dualScreenTop = window.screenTop != undefined ? window.screenTop : screen.top;

    var width = window.innerWidth ? window.innerWidth : document.documentElement.clientWidth ? document.documentElement.clientWidth : screen.width;
    var height = window.innerHeight ? window.innerHeight : document.documentElement.clientHeight ? document.documentElement.clientHeight : screen.height;

    var left = ((width / 2) - (w / 2)) + dualScreenLeft;
    var top = ((height / 2) - (h / 2)) + dualScreenTop;
    var newWindow = window.open(url, title, 'scrollbars=yes, width=' + w + ', height=' + h + ', top=' + top + ', left=' + left);

    // Puts focus on the newWindow
    if (window.focus) {
        newWindow.focus();
    }
}

function downloadDerivative(urn, derUrn, fileName) {
    console.log("downloadDerivative for urn=" + urn + " and derUrn=" + derUrn);
    // fileName = file name you want to use for download
    var url = window.location.protocol + "//" + window.location.host +
        "/md/download?urn=" + urn +
        "&derUrn=" + derUrn +
        "&fileName=" + encodeURIComponent(fileName);

    window.open(url, '_blank');
}

function getThumbnail(urn) {
    console.log("downloadDerivative for urn=" + urn);
    // fileName = file name you want to use for download
    var url = window.location.protocol + "//" + window.location.host +
        "/dm/thumbnail?urn=" + urn;

    window.open(url, '_blank');
}

function isArraySame(arr1, arr2) {
    // If both are undefined or has no value
    if (!arr1 && !arr2)
        return true;

    // If just one of them has no value
    if (!arr1 || !arr2)
        return false;

    return (arr1.sort().join(',') === arr2.sort().join(','));
}

function getDerivativeUrns(derivative, format, getThumbnail, objectIds) {
    console.log(
        "getDerivativeUrns for derivative=" + derivative.outputType +
        " and objectIds=" + (objectIds ? objectIds.toString() : "none"));
    var res = [];
    for (var childId in derivative.children) {
        var child = derivative.children[childId];
        // using toLowerCase to handle inconsistency
        if (child.role === '3d' || child.role.toLowerCase() === format) {
            if (isArraySame(child.objectIds, objectIds)) {
                // Some formats like svf might have children
                if (child.children) {
                    for (var subChildId in child.children) {
                        var subChild = child.children[subChildId];

                        if (subChild.role === 'graphics') {
                            res.push(subChild.urn);
                            if (!getThumbnail)
                                return res;
                        } else if (getThumbnail && subChild.role === 'thumbnail') {
                            res.push(subChild.urn);
                            return res;
                        }
                    }
                } else {
                    res.push(child.urn);
                    return res;
                }
            }
        }
    }

    return null;
}

// OBJ: guid & objectIds are also needed
// SVF, STEP, STL, IGES:
// Posts the job then waits for the manifest and then download the file
// if it's created
function askForFileType(format, urn, guid, objectIds, rootFileName, fileExtType, onsuccess) {
    console.log("askForFileType " + format + " for urn=" + urn);
    var advancedOptions = {
        'stl': {
            "format": "binary",
            "exportColor": true,
            "exportFileStructure": "single" // "multiple" does not work
        },
        'obj': {
            "modelGuid": guid,
            "objectIds": objectIds
        }
    };

    $.ajax({
        url: '/md/export',
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify(
            {
                urn: urn,
                format: format,
                advanced: advancedOptions[format],
                rootFileName: rootFileName,
                fileExtType: fileExtType
            }
        )
    }).done(function (data) {
        console.log(data);

        if (data.result === 'success' // newly submitted data
            || data.result === 'created') { // already submitted data
            getManifest(urn, function (res) {
                onsuccess(res);
            });
        }
    }).fail(function (err) {
        showProgress("Could not start translation", "fail");
        console.log('/md/export call failed\n' + err.statusText);
    });
}

// We need this in order to get an OBJ file for the model
function getMetadata(urn, onsuccess) {
    console.log("getMetadata for urn=" + urn);
    $.ajax({
        url: '/md/metadatas/' + urn,
        type: 'GET'
    }).done(function (data) {
        console.log(data);

        // Get first model guid
        // If it does not exists then something is wrong
        // let's check the manifest
        // If get manifest sees a failed attempt then it will
        // delete the manifest
        var md0 = data.data.metadata[0];
        if (!md0) {
            getManifest(urn, function () { });
        } else {
            var guid = md0.guid;
            if (onsuccess !== undefined) {
                onsuccess(guid);
            }
        }
    }).fail(function (err) {
        console.log('GET /md/metadata call failed\n' + err.statusText);
    });
}

function getHierarchy(urn, guid, onsuccess) {
    console.log("getHierarchy for urn=" + urn + " and guid=" + guid);
    $.ajax({
        url: '/md/hierarchy',
        type: 'GET',
        data: { urn: urn, guid: guid }
    }).done(function (data) {
        console.log(data);

        // If it's 'accepted' then it's not ready yet
        if (data.result === 'accepted') {
            // Let's try again
            if (MyVars.keepTrying) {
                window.setTimeout(function () {
                    getHierarchy(urn, guid, onsuccess);
                }, 500
                );
            } else {
                MyVars.keepTrying = true;
            }

            return;
        }

        // We got what we want
        if (onsuccess !== undefined) {
            onsuccess(data);
        }
    }).fail(function (err) {
        console.log('GET /md/hierarchy call failed\n' + err.statusText);
    });
}

function getProperties(urn, guid, onsuccess) {
    console.log("getProperties for urn=" + urn + " and guid=" + guid);
    $.ajax({
        url: '/md/properties',
        type: 'GET',
        data: { urn: urn, guid: guid }
    }).done(function (data) {
        console.log(data);

        if (onsuccess !== undefined) {
            onsuccess(data);
        }
    }).fail(function (err) {
        console.log('GET /api/properties call failed\n' + err.statusText);
    });
}

function getManifest(urn, onsuccess) {
    console.log("getManifest for urn=" + urn);
    $.ajax({
        url: '/md/manifests/' + urn,
        type: 'GET'
    }).done(function (data) {
        console.log(data);

        if (data.status !== 'failed') {
            if (data.progress !== 'complete') {
                showProgress("Translation progress: " + data.progress, data.status);

                if (MyVars.keepTrying) {
                    // Keep calling until it's done
                    window.setTimeout(function () {
                        getManifest(urn, onsuccess);
                    }, 500
                    );
                } else {
                    MyVars.keepTrying = true;
                }
            } else {
                showProgress("Translation completed", data.status);
                onsuccess(data);
            }
            // if it's a failed translation best thing is to delete it
        } else {
            showProgress("Translation failed", data.status);
            // Should we do automatic manifest deletion in case of a failed one?
            //delManifest(urn, function () {});
        }
    }).fail(function (err) {
        showProgress("Translation failed", 'failed');
        console.log('GET /api/manifest call failed\n' + err.statusText);
    });
}

function delManifest(urn, onsuccess) {
    console.log("delManifest for urn=" + urn);
    $.ajax({
        url: '/md/manifests/' + urn,
        type: 'DELETE'
    }).done(function (data) {
        console.log(data);
        if (data.status === 'success') {
            if (onsuccess !== undefined) {
                onsuccess(data);
            }
        }
    }).fail(function (err) {
        console.log('DELETE /api/manifest call failed\n' + err.statusText);
    });
}

/////////////////////////////////////////////////////////////////
// Formats / #forgeFormats
// Shows the export file formats available for the selected model
/////////////////////////////////////////////////////////////////

function getFormats(onsuccess) {
    console.log("getFormats");
    $.ajax({
        url: '/md/formats',
        type: 'GET'
    }).done(function (data) {
        console.log(data);

        if (onsuccess !== undefined) {
            onsuccess(data);
        }
    }).fail(function (err) {
        console.log('GET /md/formats call failed\n' + err.statusText);
    });
}

function fillFormats() {
    getFormats(function (data) {
        var forgeFormats = $("#forgeFormats");
        forgeFormats.data("forgeFormats", data);

        var download = $("#downloadExport");
        download.click(function () {
            MyVars.keepTrying = true;

            var elem = $("#forgeHierarchy");
            var tree = elem.jstree();
            var rootNodeId = tree.get_node('#').children[0];
            var rootNode = tree.get_node(rootNodeId);

            var format = $("#forgeFormats").val();
            var urn = MyVars.selectedUrn;
            var guid = MyVars.selectedGuid;
            var fileName = rootNode.text + "." + format;
            var rootFileName = MyVars.rootFileName;
            var nodeIds = elem.jstree("get_checked", null, true);

            // Only OBJ supports subcomponent selection
            // using objectId's
            var objectIds = null;
            if (format === 'obj') {
                objectIds = [-1];
                if (nodeIds.length) {
                    objectIds = [];

                    $.each(nodeIds, function (index, value) {
                        objectIds.push(parseInt(value, 10));
                    });
                }
            }

            // The rest can be exported with a single function
            askForFileType(format, urn, guid, objectIds, rootFileName, MyVars.fileExtType, function (res) {
                if (format === 'thumbnail') {
                    getThumbnail(urn);

                    return;
                }

                // Find the appropriate obj part
                for (var derId in res.derivatives) {
                    var der = res.derivatives[derId];
                    if (der.outputType === format) {
                        // found it, now get derivative urn
                        // leave objectIds parameter undefined
                        var derUrns = getDerivativeUrns(der, format, false, objectIds);

                        // url encode it
                        if (derUrns) {
                            derUrns[0] = encodeURIComponent(derUrns[0]);

                            downloadDerivative(urn, derUrns[0], fileName);

                            // in case of obj format, also try to download the material
                            if (format === 'obj') {
                                // The MTL file needs to have the exact name that it has on OSS
                                // because that's how it's referenced from the OBJ file
                                var ossName = decodeURIComponent(derUrns[0]);
                                var ossNameParts = ossName.split("/");
                                // Get the last element
                                ossName = ossNameParts[ossNameParts.length - 1];

                                downloadDerivative(urn, derUrns[0].replace('.obj', '.mtl'), ossName.replace('.obj', '.mtl'));
                            }
                        } else {
                            showProgress("Could not find specific OBJ file", "failed");
                            console.log("askForFileType, Did not find the OBJ translation with the correct list of objectIds");
                        }

                        return;
                    }
                }

                showProgress("Could not find exported file", "failed");
                console.log("askForFileType, Did not find " + format + " in the manifest");
            });

        });

        var deleteManifest = $("#deleteManifest");
        deleteManifest.click(function () {
            var urn = MyVars.selectedUrn;

            cleanupViewer();

            delManifest(urn, function () { });
        });
    });
}

function updateFormats(format) {

    var forgeFormats = $("#forgeFormats");
    var formats = forgeFormats.data("forgeFormats");
    forgeFormats.empty();

    // obj is not listed for all possible files
    // using this workaround for the time being
    //forgeFormats.append($("<option />").val('obj').text('obj'));

    $.each(formats.formats, function (key, value) {
        if (key === 'obj' || value.indexOf(format) > -1) {
            forgeFormats.append($("<option />").val(key).text(key));
        }
    });
}

/////////////////////////////////////////////////////////////////
// Files Tree / #forgeFiles
// Shows the A360 hubs, projects, folders and files of
// the logged in user
/////////////////////////////////////////////////////////////////

var haveBIM360Hub = false;

function prepareFilesTree() {
    console.log("prepareFilesTree");
    $.getJSON("/api/forge/clientID", function (res) {
        $("#ClientID").val(res.ForgeClientId);
    });

    $('#forgeFiles').jstree({
        'core': {
            'themes': { "icons": true },
            'check_callback': true, // make it modifiable
            'data': {
                cache: false,
                "url": '/dm/treeNode',
                "dataType": "json",
                "data": function (node) {
                    return {
                        "href": (node.id === '#' ? '#' : node.original.href)
                    };
                },
                "success": function (nodes) {
                    nodes.forEach(function (n) {
                        if (n.type === 'hubs' && n.href.indexOf('b.') > 0)
                            haveBIM360Hub = true;
                    });

                    if (!haveBIM360Hub) {
                        $("#provisionAccountModal").modal();
                        $("#provisionAccountSave").click(function () {
                            $('#provisionAccountModal').modal('toggle');
                            $('#forgeFiles').jstree(true).refresh();
                        });
                        haveBIM360Hub = true;
                    }
                }
            }
        },
        'types': {
            'default': {
                'icon': 'glyphicon glyphicon-cloud'
            },
            '#': {
                'icon': 'glyphicon glyphicon-user'
            },
            'hubs': {
                'icon': 'glyphicon glyphicon-inbox'
            },
            'projects': {
                'icon': 'glyphicon glyphicon-list-alt'
            },
            'items': {
                'icon': 'glyphicon glyphicon-briefcase'
            },
            'folders': {
                'icon': 'glyphicon glyphicon-folder-open'
            },
            'versions': {
                'icon': 'glyphicon glyphicon-time'
            }
        },
        "plugins": ["types", "contextmenu"], // let's not use sort or state: , "state" and "sort"],
        'contextmenu': {
            'select_node': false,
            'items': filesTreeContextMenu
        }
    }).bind("select_node.jstree", function (evt, data) {
        // Clean up previous instance
        cleanupViewer();

        // Disable the hierarchy related controls for the time being
        //$("#forgeFormats").attr('disabled', 'disabled');
        //$("#downloadExport").attr('disabled', 'disabled');

        if (data.node.type === 'versions') {
            $("#deleteManifest").removeAttr('disabled');
            $("#uploadFile").removeAttr('disabled');

            MyVars.keepTrying = true;
            MyVars.selectedNode = data.node;

            // Clear hierarchy tree
            $('#forgeHierarchy').empty().jstree('destroy');

            // Clear properties tree
            $('#forgeProperties').empty().jstree('destroy');

            // Delete cached data
            $('#forgeProperties').data('forgeProperties', null);

            updateFormats(data.node.original.fileType);

            // Store info on selected file
            MyVars.rootFileName = data.node.original.rootFileName;
            MyVars.fileName = data.node.original.fileName;
            MyVars.fileExtType = data.node.original.fileExtType;

            if ($('#wipVsStorage').hasClass('active')) {
                console.log("Using WIP id");
                MyVars.selectedUrn = base64encode(data.node.original.wipid);
            } else {
                console.log("Using Storage id");
                MyVars.selectedUrn = base64encode(data.node.original.storage);
            }

            // Fill hierarchy tree
            // format, urn, guid, objectIds, rootFileName, fileExtType
            showHierarchy(
                MyVars.selectedUrn,
                null,
                null,
                MyVars.rootFileName,
                MyVars.fileExtType
            );
            console.log(
                "data.node.original.storage = " + data.node.original.storage,
                "data.node.original.wipid = " + data.node.original.wipid,
                ", data.node.original.fileName = " + data.node.original.fileName,
                ", data.node.original.fileExtType = " + data.node.original.fileExtType
            );

            // Show in viewer
            //initializeViewer(data.node.data);
        } else {
            $("#deleteManifest").attr('disabled', 'disabled');
            $("#uploadFile").attr('disabled', 'disabled');

            // Just open the children of the node, so that it's easier
            // to find the actual versions
            $("#forgeFiles").jstree("open_node", data.node);

            // And clear trees to avoid confusion thinking that the
            // data belongs to the clicked model
            $('#forgeHierarchy').empty().jstree('destroy');
            $('#forgeProperties').empty().jstree('destroy');
        }
    });
}

function downloadAttachment(href, attachmentVersionId) {
    console.log("downloadAttachment for href=" + href);
    // fileName = file name you want to use for download
    var url = window.location.protocol + "//" + window.location.host +
        "/dm/attachments/" + encodeURIComponent(attachmentVersionId) + "?href=" + encodeURIComponent(href);

    window.open(url, '_blank');
}

function deleteAttachment(href, attachmentVersionId) {
    alert("Functionality not available yet");
    return;

    console.log("deleteAttachment for href=" + href);
    $.ajax({
        url: '/dm/attachments/' + encodeURIComponent(attachmentVersionId),
        headers: { 'wip-href': href },
        type: 'DELETE'
    }).done(function (data) {
        console.log(data);
        if (data.status === 'success') {
            if (onsuccess !== undefined) {
                onsuccess(data);
            }
        }
    }).fail(function (err) {
        console.log('DELETE /api/manifest call failed\n' + err.statusText);
    });
}

function filesTreeContextMenu(node, callback) {
    if (node.type === 'versions') {
        $.ajax({
            url: '/dm/attachments',
            data: { href: node.original.href },
            type: 'GET',
            success: function (data) {
                var menuItems = {
                    publicUrl: {
                        "label": "Public URL",
                        "action": function (obj) {
                            getPublicUrl(obj.item.href);
                        },
                        "href": node.original.href,
                        "versionId": node.data
                    }
                };
                data.data.forEach(function (item) {
                    if (item.meta.extension.type === "auxiliary:autodesk.core:Attachment") {
                        var menuItem = {
                            "label": item.displayName,
                            "action": function (obj) {
                                alert(obj.item.label + " with versionId = " + obj.item.versionId);
                            },
                            "versionId": item.id,
                            "submenu": {
                                "open": {
                                    "label": "Open",
                                    "action": function (obj) {
                                        downloadAttachment(obj.item.href, obj.item.versionId);
                                    },
                                    "versionId": item.id,
                                    "href": node.original.href
                                },
                                "delete": {
                                    "label": "Delete",
                                    "action": function (obj) {
                                        deleteAttachment(obj.item.href, obj.item.versionId);
                                    },
                                    "versionId": item.id,
                                    "href": node.original.href
                                }
                            }
                        };

                        menuItems[item.id] = menuItem;
                    }
                })

                if (!menuItems) {
                    callback({ noItem: { label: "No attachments", action: function () { } } });
                } else {
                    callback(menuItems);
                }
            }
        });
    }

    return;
}

function getPublicUrl(id) {
    $.ajax({
        url: '/dm/files/' + encodeURIComponent(id) + '/publicurl',
        type: 'GET'
    }).done(function (data) {
        console.log(data);
        alert(data.signedUrl);
    }).fail(function(err) {
        console.log('DELETE /dm/buckets/ call failed\n' + err.statusText);
    });
}

/////////////////////////////////////////////////////////////////
// Hierarchy Tree / #forgeHierarchy
// Shows the hierarchy of components in selected model
/////////////////////////////////////////////////////////////////

function showHierarchy(urn, guid, objectIds, rootFileName, fileExtType) {

    // You need to
    // 1) Post a job
    // 2) Get matadata (find the model guid you need)
    // 3) Get the hierarchy based on the urn and model guid

    // Get svf export in order to get hierarchy and properties
    // for the model
    var format = 'svf';
    askForFileType(format, urn, guid, objectIds, rootFileName, fileExtType, function (manifest) {
        getMetadata(urn, function (guid) {
            showProgress("Retrieving hierarchy...", "inprogress");

            getHierarchy(urn, guid, function (data) {
                showProgress("Retrieved hierarchy", "success");

                for (var derId in manifest.derivatives) {
                    var der = manifest.derivatives[derId];
                    // We just have to make sure there is an svf
                    // translation, but the viewer will find it
                    // from the urn
                    if (der.outputType === 'svf') {

                        initializeViewer(urn);
                    }
                }

                prepareHierarchyTree(urn, guid, data.data);
            });
        });
    });
}

function addHierarchy(nodes) {
    for (var nodeId in nodes) {
        var node = nodes[nodeId];

        // We are also adding properties below that
        // this function might iterate over and we should skip
        // those nodes
        if (node.type && node.type === 'property' || node.type === 'properties') {
            // skip this node
            var str = "";
        } else {
            node.text = node.name;
            node.children = node.objects;
            if (node.objectid === undefined) {
                node.type = 'dunno'
            } else {
                node.id = node.objectid;
                node.type = 'object'
            }
            addHierarchy(node.objects);
        }
    }
}

function prepareHierarchyTree(urn, guid, json) {
    // Convert data to expected format
    addHierarchy(json.objects);

    // Enable the hierarchy related controls
    //$("#forgeFormats").removeAttr('disabled');
    //$("#downloadExport").removeAttr('disabled');

    // Store info of selected item
    MyVars.selectedUrn = urn;
    MyVars.selectedGuid = guid;

    // init the tree
    $('#forgeHierarchy').jstree({
        'core': {
            'check_callback': true,
            'themes': { "icons": true },
            'data': json.objects
        },
        'checkbox': {
            'tie_selection': false,
            "three_state": true,
            'whole_node': false
        },
        'types': {
            'default': {
                'icon': 'glyphicon glyphicon-cloud'
            },
            'object': {
                'icon': 'glyphicon glyphicon-save-file'
            }
        },
        "plugins": ["types", "sort", "checkbox", "ui", "themes", "contextmenu"],
        'contextmenu': {
            'select_node': false,
            'items': hierarchyTreeContextMenu
        }
    }).bind("select_node.jstree", function (evt, data) {
        if (data.node.type === 'object') {
            var urn = MyVars.selectedUrn;
            var guid = MyVars.selectedGuid;
            var objectId = data.node.original.objectid;

            // Empty the property tree
            $('#forgeProperties').empty().jstree('destroy');

            fetchProperties(urn, guid, function (props) {
                preparePropertyTree(urn, guid, objectId, props);
                selectInViewer([objectId]);
            });
        }
    }).bind("check_node.jstree uncheck_node.jstree", function (evt, data) {
        // To avoid recursion we are checking if the changes are
        // caused by a viewer selection which is calling
        // selectInHierarchyTree()
        if (!MyVars.selectingInHierarchyTree) {
            var elem = $('#forgeHierarchy');
            var nodeIds = elem.jstree("get_checked", null, true);

            // Convert from strings to numbers
            var objectIds = [];
            $.each(nodeIds, function (index, value) {
                objectIds.push(parseInt(value, 10));
            });

            selectInViewer(objectIds);
        }
    });
}

function selectInHierarchyTree(objectIds) {
    MyVars.selectingInHierarchyTree = true;

    try {
        var tree = $("#forgeHierarchy").jstree();

        // First remove all the selection
        tree.uncheck_all();

        // Now select the newly selected items
        for (var key in objectIds) {
            var id = objectIds[key];

            // Select the node
            tree.check_node(id);

            // Make sure that it is visible for the user
            tree._open_to(id);
        }
    } catch (ex) { }

    MyVars.selectingInHierarchyTree = false;
}

function hierarchyTreeContextMenu(node, callback) {
    var menuItems = {};

    var menuItem = {
        "label": "Select in Fusion",
        "action": function (obj) {
            var path = $("#forgeHierarchy").jstree().get_path(node, '/');
            alert(path);

            // Open this in the browser:
            // fusion360://command=open&file=something&properties=MyCustomPropertyValues
            var url = "fusion360://command=open&file=something&properties=" + encodeURIComponent(path);
            $("#fusionLoader").attr("src", url);
        }
    };
    menuItems[0] = menuItem;

    //callback(menuItems);

    //return menuItems;
    return null; // for the time being
}

/////////////////////////////////////////////////////////////////
// Property Tree / #forgeProperties
// Shows the properties of the selected sub-component
/////////////////////////////////////////////////////////////////

// Storing the collected properties since you get them for the whole
// model. So when clicking on the various sub-components in the
// hierarchy tree we can reuse it instead of sending out another
// http request
function fetchProperties(urn, guid, onsuccess) {
    var props = $("#forgeProperties").data("forgeProperties");
    if (!props) {
        getProperties(urn, guid, function (data) {
            $("#forgeProperties").data("forgeProperties", data.data);
            onsuccess(data.data);
        })
    } else {
        onsuccess(props);
    }
}

// Recursively add all the additional properties under each
// property node
function addSubProperties(node, props) {
    node.children = node.children || [];
    for (var subPropId in props) {
        var subProp = props[subPropId];
        if (subProp instanceof Object) {
            var length = node.children.push({
                "text": subPropId,
                "type": "properties"
            });
            var newNode = node.children[length - 1];
            addSubProperties(newNode, subProp);
        } else {
            node.children.push({
                "text": subPropId + " = " + subProp.toString(),
                "type": "property"
            });
        }
    }
}

// Add all the properties of the selected sub-component
function addProperties(node, props) {
    // Find the relevant property section
    for (var propId in props) {
        var prop = props[propId];
        if (prop.objectid === node.objectid) {
            addSubProperties(node, prop.properties);
        }
    }
}

function preparePropertyTree(urn, guid, objectId, props) {
    // Convert data to expected format
    var data = { 'objectid': objectId };
    addProperties(data, props.collection);

    // init the tree
    $('#forgeProperties').jstree({
        'core': {
            'check_callback': true,
            'themes': { "icons": true },
            'data': data.children
        },
        'types': {
            'default': {
                'icon': 'glyphicon glyphicon-cloud'
            },
            'property': {
                'icon': 'glyphicon glyphicon-tag'
            },
            'properties': {
                'icon': 'glyphicon glyphicon-folder-open'
            }
        },
        "plugins": ["types", "sort"]
    }).bind("activate_node.jstree", function (evt, data) {
        //
    });
}

/////////////////////////////////////////////////////////////////
// Viewer
// Based on Autodesk Viewer basic sample
// https://developer.autodesk.com/api/viewerapi/
/////////////////////////////////////////////////////////////////

function cleanupViewer() {
    // Clean up previous instance
    if (MyVars.viewer && MyVars.viewer.model) {
        console.log("Unloading current model from Autodesk Viewer");

        //MyVars.viewer.impl.unloadModel(MyVars.viewer.model);
        //MyVars.viewer.impl.sceneUpdated(true);
        MyVars.viewer.tearDown();
        MyVars.viewer.setUp(MyVars.viewer.config);

        document.getElementById('forgeViewer').style.display = 'none';
    }
}

function initializeViewer(urn) {
    cleanupViewer();

    document.getElementById('forgeViewer').style.display = 'block';

    console.log("Launching Autodesk Viewer for: " + urn);

    var options = {
        document: 'urn:' + urn,
        env: 'AutodeskProduction',
        getAccessToken: get3LegToken // this works fine, but if I pass get3LegToken it only works the first time
    };

    if (MyVars.viewer) {
        loadDocument(MyVars.viewer, options.document);
    } else {
        var viewerElement = document.getElementById('forgeViewer');
        var config = {
            extensions: ['Autodesk.Viewing.WebVR', 'Autodesk.Viewing.MarkupsGui'],
            experimental: ['webVR_orbitModel']
        };
        MyVars.viewer = new Autodesk.Viewing.Private.GuiViewer3D(viewerElement, config);
        Autodesk.Viewing.Initializer(
            options,
            function something () {
                MyVars.viewer.start(); // this would be needed if we also want to load extensions
                loadDocument(MyVars.viewer, options.document);
                addSelectionListener(MyVars.viewer);
            }
        );
    }
}

function addSelectionListener(viewer) {
    viewer.addEventListener(
        Autodesk.Viewing.SELECTION_CHANGED_EVENT,
        function (event) {
            selectInHierarchyTree(event.dbIdArray);

            var dbId = event.dbIdArray[0];
            if (dbId) {
                viewer.getProperties(dbId, function (props) {
                    console.log(props.externalId);
                });
            }
        });
}

// Get the full path of the selected body
function getFullPath(tree, dbId) {
    var path = [];
    while (dbId) {
        var name = tree.getNodeName(dbId);
        path.unshift(name);
        dbId = tree.getNodeParentId(dbId);
    }

    // We do not care about the top 2 items because it's just the file name
    // and root component name
    path = path.splice(2, path.length - 1)

    return path.join('+');
}

function showAllProperties(viewer) {
    var instanceTree = viewer.model.getData().instanceTree;

    var allDbIds = Object.keys(instanceTree.nodeAccess.dbIdToIndex);

    for (var key in allDbIds) {
        var id = allDbIds[key];
        viewer.model.getProperties(id, function (data) {
            var str = "";
        });
    }
}

function toggleLayer(layerName, viewer) {
    var root = viewer.impl.getLayersRoot();

    if (root == null) {
        console.log("No layer information...");
        return;
    }

    var toggleLayerSub = function(layer, layerName, viewer) {
        if (layer.name === layerName) {
            var visible = !viewer.isLayerVisible(layer);
            viewer.setLayerVisible(
                [layer], // list of layers
                visible, // visible
                false    // isolate
            );
        }
    }

    for (var i = 0; i < root.childCount; i++) {
        var layer = root.children[i];

        // We can also check inside layer groups 
        if (!layer.isLayer) {
            for (var j = 0; j < layer.childCount; j++) {
                toggleLayerSub(layer[j], layerName, viewer);
            }
        } else {
            toggleLayerSub(layer, layerName, viewer);
        }  
    }
}

// Adds a button to the toolbar that can be used
// to check for body sepcific data in our mongo db
// Call this once the Viewer has been set up
function addFusionButton(viewer) {
    var button = new Autodesk.Viewing.UI.Button('toolbarFusion');
    button.onClick = function (e) {
        toggleLayer("Title (ANSI)", viewer);
        return;

        var ids = viewer.getSelection();
        if (ids.length === 1) {
            var tree = viewer.model.getInstanceTree();
            var fullPath = getFullPath(tree, ids[0]);
            console.log(fullPath);

            $.ajax({
                url: '/dm/fusionData/' + viewer.model.loader.svfUrn + '/' + encodeURIComponent(fullPath),
                type: 'GET'
            }).done(function (data) {
                console.log('Retrieved data');
                console.log(data);

                alert(JSON.stringify(data, null, 2));
            }).fail(function (xhr, ajaxOptions, thrownError) {
                alert('Failed to retrieve data');
            });
        }
    };
    button.addClass('toolbarFusionButton');
    button.setToolTip('Show Fusion properties');

    // SubToolbar
    var subToolbar = new Autodesk.Viewing.UI.ControlGroup('myFusionAppGroup');
    subToolbar.addControl(button);

    viewer.toolbar.addControl(subToolbar);
}


function subscribeToAllEvents(viewer) {
    for (var key in Autodesk.Viewing) {
        if (key.endsWith("_EVENT")) {
            (function (eventName) {
                viewer.addEventListener(
                    Autodesk.Viewing[eventName],
                    function (event) {
                        console.log(eventName, "/", event);
                    }
                );
            })(key);
        }
    }
}

function loadDocument(viewer, documentId) {
    // Set the Environment to "Riverbank"
    viewer.setLightPreset(8);

    // Make sure that the loaded document's setting won't
    // override it and change it to something else
    viewer.prefs.tag('ignore-producer');

    Autodesk.Viewing.Document.load(
        documentId,
        // onLoad
        function (doc) {
            var geometryItems = [];
            // Try 3d geometry first
            geometryItems = Autodesk.Viewing.Document.getSubItemsWithProperties(doc.getRootItem(), {
                'type': 'geometry',
                'role': '3d'
            }, true);

            //subscribeToAllEvents(viewer);

            // If no 3d then try 2d
            if (geometryItems.length < 1)
                geometryItems = Autodesk.Viewing.Document.getSubItemsWithProperties(doc.getRootItem(), {
                    'type': 'geometry',
                    'role': '2d'
                }, true);

            if (geometryItems.length > 0) {
                var path = doc.getViewablePath(geometryItems[0]);
                //viewer.load(doc.getViewablePath(geometryItems[0]), null, null, null, doc.acmSessionId /*session for DM*/);
                var options = {};
                viewer.loadModel(path, options);
                addFusionButton(viewer);
            }

            viewer.addEventListener(
                Autodesk.Viewing.GEOMETRY_LOADED_EVENT,
                function (event) {
                    MyVars.startTracking(viewer, 1500, { x: 800, y: 500, z: 1000 });
                }
            );
        },
        // onError
        function (errorMsg) {
            //showThumbnail(documentId.substr(4, documentId.length - 1));
        }
    )
}

function selectInViewer(objectIds) {
    if (MyVars.viewer) {
        MyVars.viewer.select(objectIds);
    }
}

/////////////////////////////////////////////////////////////////
// ART SmartTrack
/////////////////////////////////////////////////////////////////

MyVars.startTracking = function (viewer, artSize, artTranslation) {
    if (!MyVars._socket) {
        MyVars._socket = io();
    }

    // We need perspecive view in order to go inside buildings, etc
    viewer.navigation.toPerspective();

    var _modelBox = viewer.model.getBoundingBox();
    var _modelSize = _modelBox.min.distanceTo(_modelBox.max);
    var _scale = _modelSize / artSize;

    function setCamera(viewer, positionValues, matrixValues) {
        // This is used to transformt the camera positions so that XY is the horizontal plane and
        // Z is the up vector  
        // In case of camera:
        //   Z is distance from camera >> Viewer X
        //   X is up and down >> Viewer Z
        //   Y is left and right >> Viewer Y 
        var positionTransform = new THREE.Matrix4();
        positionTransform.set(
            0, -_scale, 0, artTranslation.y * _scale,
            0, 0, _scale, -artTranslation.z * _scale,
            -_scale, 0, 0, artTranslation.x * _scale,
            0, 0, 0, 1);

        var camera = new THREE.Matrix4();
        camera.set(
            matrixValues[0], matrixValues[3], matrixValues[6], 0,
            matrixValues[1], matrixValues[4], matrixValues[7], 0,
            matrixValues[2], matrixValues[5], matrixValues[8], 0,
            0, 0, 0, 1);

        var position = new THREE.Matrix4();
        position.set(
            1, 0, 0, positionValues[0],
            0, 1, 0, positionValues[1],
            0, 0, 1, positionValues[2],
            0, 0, 0, 1);

        var targetZ = new THREE.Vector3(0, 0, 1);
        targetZ = targetZ.applyMatrix4(camera);
        //console.log(">>>>>>>>> targetZ", targetZ);

        //console.log("original position", position);
        position = positionTransform.multiply(position);
        //console.log("transformed position", position);

        //console.log("original camera", camera);
        camera = positionTransform.multiply(camera);
        //console.log("transformed camera", camera);


        // Main camera vectors
        var x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3();
        camera.extractBasis(x, y, z);
        //console.log(x, y, z);

        // Eye / Position
        var eye = new THREE.Vector3();
        eye.setFromMatrixPosition(position);
        //console.log("eye", eye);

        // Target / Center
        var target = new THREE.Vector3().copy(eye);
        target.add(x.setLength(2));
        //console.log("target", target);

        // UpVector
        var up = z.setLength(1);
        //console.log("up", up);

        // Set values
        viewer.navigation.setTarget(target);
        viewer.navigation.setPosition(eye);
        viewer.navigation.setCameraUpVector(up);
    }

    MyVars._socket.on('ART', function (msg) {
        // Will be something like:
        // 6di 4 [0 0 0.000][0.000 0.000 0.000][0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000] 
        // [1 0 0.000][0.000 0.000 0.000][0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000] 
        // [2 0 0.000][0.000 0.000 0.000][0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000] 
        // [3 0 0.000][0.000 0.000 0.000][0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000]
        //console.log(msg);

        if (MyVars.viewer.navigation) {
            var arrays = msg.split("[");

            var positionStrings = arrays[2].replace("]", "").split(" ");
            var matrixStrings = arrays[3].replace("] ", "").split(" ");

            var positionValues = positionStrings.map(v => parseFloat(v));
            var matrixValues = matrixStrings.map(v => parseFloat(v));

            setCamera(MyVars.viewer, positionValues, matrixValues);
        }
    });
}

/////////////////////////////////////////////////////////////////
// Other functions
/////////////////////////////////////////////////////////////////

function showProgress(text, status) {
    var progressInfo = $('#progressInfo');
    var progressInfoText = $('#progressInfoText');
    var progressInfoIcon = $('#progressInfoIcon');

    var oldClasses = progressInfo.attr('class');
    var newClasses = "";
    var newText = text;

    if (status === 'failed') {
        newClasses = 'btn btn-danger';
    } else if (status === 'inprogress' || status === 'pending') {
        newClasses = 'btn btn-warning';
        newText += " (Click to stop)";
    } else if (status === 'success') {
        newClasses = 'btn btn-success';
    } else {
        newClasses = 'btn btn-info';
    }

    // Only update if changed
    if (progressInfoText.text() !== newText) {
        progressInfoText.text(newText);
    }

    if (oldClasses !== newClasses) {
        progressInfo.attr('class', newClasses);

        if (newClasses === 'btn btn-warning') {
            progressInfoIcon.attr('class', 'glyphicon glyphicon-refresh glyphicon-spin');
        } else {
            progressInfoIcon.attr('class', '');
        }
    }
}


