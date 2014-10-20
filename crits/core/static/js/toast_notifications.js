$(document).ready(function() {
    var notyIDToNotyDict = {};

    function generateContainerNoty(container, type, message, timeout, id) {

        var n = $(container).noty({
            text        : message,
            type        : type,
            dismissQueue: true,
            layout      : 'topCenter',
            timeout     : timeout,
            theme       : 'defaultTheme',
            maxVisible  : 10,
            closeWith   : ['button'],
            callback: {
                onShow: function() {
                    var $closeNotifications = $("#close_notifications");

                    if($closeNotifications.length === 0) {
                        $("#notifications").append('<div id="close_notifications" class="noty_message">[Close All]</div>');

                        $("#close_notifications").click(function() {
                            $("#notifications").find(".noty_bar").each(function() {
                                // could do $.noty.closeAll() but it doesn't
                                // display any of the hidden notifications
                                // due to maxVisible limit.
                                $.noty.close($(this).attr("id"));
                            });
                            $("#close_notifications").hide();
                        });

                    } else {
                        // move the close notifications to the bottom, because
                        // it will reset to the top after all the notifications
                        // have been closed.
                        $closeNotifications.parent().append($closeNotifications);
                        $("#close_notifications").show();
                    }
                },
                onClose: function(self) {
                    var notifications_li = $("#notifications > ul > li");

                    if(notifications_li.length === 1) {
                        // this means that all the notifications have been
                        // closed, so hide the close notifications box.
                        $("#close_notifications").hide();
                    }

                    if(n.options.id in notyIDToNotyDict) {
                        var notyToDelete = notyIDToNotyDict[n.options.id];
                        var idToDelete = notyToDelete['mongoID'];

                        $.ajax({
                            url: notifications_ack_url,
                            dataType: "json",
                            type: "POST",
                            data: {id: idToDelete}
                        });

                        delete notyIDToNotyDict[n.options.id];
                    }
                }
            }
        });

        notyIDToNotyDict[n.options.id] = {'noty': n, 'mongoID': id};
    }

    if(typeof notifications_url !== "undefined") {
        var numPollFailures = 0;

        var timeparts = [
            {name: 'year', div: 31536000000, mod: 10000},
            {name: 'day', div: 86400000, mod: 365},
            {name: 'hour', div: 3600000, mod: 24},
            {name: 'min', div: 60000, mod: 60},
            {name: 'sec', div: 1000, mod: 60}
         ];

         function timeAgoFuzzy(currentDate, comparisonDate) {
            var
                i = 0,
                l = timeparts.length,
                calc,
                result = null,
                interval = currentDate.getTime() - comparisonDate.getTime();
            while (i < l && result === null) {
                calc = Math.floor(interval / timeparts[i].div) % timeparts[i].mod;
                if (calc) {
                    if(timeparts[i].name === 'sec' && calc < 5) {
                        result = 'just now';
                    }
                    else {
                        result = calc + ' ' + timeparts[i].name + (calc !== 1 ? 's' : '') + ' ago';
                    }
                }
                i += 1;
            }

            if(result === null) {
                result = 'just now';
            }

            return result;
         }

        (function poll(date_param) {
            var newer_than = null;

            if(typeof date_param !== "undefined" && date_param !== "") {
                newer_than = date_param;
            }

            // the default timeout to throttle polling attempts.
            var poll_timeout = 3000;

            $.ajax({
                url: notifications_url,
                timeout: 120000,
                dataType: "json",
                type: "POST",
                data: {newer_than: newer_than},
                success: function (data) {
                    numPollFailures = 0;
                    var notifications = data['notifications'];
                    var newest_notification = data['newest_notification'];
                    var serverTime = data['server_time'];
                    var dialogTimeout = data['timeout'];

                    if(newest_notification !== null) {
                        newer_than = newest_notification;
                    }

                    for(var counter = notifications.length - 1; counter >= 0 ; counter--) {
                        var message = "";

                        var notification = notifications[counter];
                        var id = notification['id'];
                        var modifiedBy = notification['modified_by'];
                        var dateModified = notification['date_modified'];
                        var notificationType = notification['type'];

                        if(typeof notificationType === 'undefined') {
                            notificationType = 'alert';
                        }

                        if("message" in notification) {
                            var formattedMessage = "";
                            var messageSegments = notification['message'].split('\n');

                            for(var i in messageSegments) {
                                if(messageSegments[i].indexOf("updated the following attributes:") === -1 &&
                                        messageSegments[i].indexOf("deleted the following") === -1) {

                                    formattedMessage += messageSegments[i];

                                    if(i < messageSegments.length - 1) {
                                        formattedMessage += "<br>";
                                    }
                                }
                            }

                            message = "<a href='" + notification['link'] + "' target='_blank'>" + notification['header'] +
                                    "</a> (by <b>" + modifiedBy + "</b> <span class='noty_modified' data-modified='" +
                                    dateModified + "'></span>)<br/>" + formattedMessage;

                            generateContainerNoty('div#notifications', notificationType, message, dialogTimeout, id);
                        }
                    }

                    $("span.noty_modified").each(function() {
                        var modifiedDate = new Date($(this).data("modified"));
                        var serverDate = new Date(serverTime);
                        var dateDifference = timeAgoFuzzy(serverDate, modifiedDate);

                        $(this).text(dateDifference);
                    });
                },
                error: function(data) {
                    // if an error occurred then give the server much more time
                    // to try and recover from the error before reattempting.
                    poll_timeout = 60000;
                    numPollFailures++;
                },
                complete: function() {
                    // keep polling only if we haven't encountered x
                    // consecutive failures.
                    if(numPollFailures < 5) {
                        // throttle a little bit before polling again
                        setTimeout(poll, poll_timeout, newer_than);
                    }
                }
            });
        })(); // this function is executed here
    }
}); //document.ready