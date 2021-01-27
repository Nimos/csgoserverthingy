
$(document).ready(function () {
    /*
        Event Listener to handle entering the site password
    */
    $("input#link").keydown(function (ev) {
        if (ev.keyCode == 13) {
            $(this).blur().addClass('loading');
            $.post('/login', { password: $(this).val() }, (result) => {
                if (result.success) {
                    $('#server-status').text(result.status);
                    populateCvars(result.cvars);
                    populateConfigVars(result.config);
                    populateButtons(result.actions);
                    $(this).fadeOut(() => populateConfigs(result.configs));
                }
            });
        }
    });

    /*
        Event Listener to handle switching config files
    */
    $(document).on('click', '.config:not(.readonly)', (ev) => {
        let name = $(ev.currentTarget).data('name');

        $(ev.currentTarget).addClass('loading');

        $.post('/switch', { name: name }, (result) => {
            $(ev.currentTarget).removeClass('loading');
            if (result.success) {
                $('.config.active').removeClass('active');
                $(ev.currentTarget).addClass('active');
            } else {
                $(ev.currentTarget).addClass('error');
            }
        })
    });

    /*
        Event Listener to initiate editing a CVar
    */
    $(document).on('click', '.option-value:not(.readonly)', (ev) => {
        $(ev.currentTarget).attr('contenteditable', 'true').focus(() => $(ev.currentTarget).select());
    });

    /*
        Event Listener to handle changing CVars
    */
    $(document).on('keydown', '.cvars .option-value:not(.readonly)', (ev) => {
        if (ev.keyCode == 13) {
            $(ev.currentTarget).attr('contenteditable', 'false').blur();
            $(ev.currentTarget).addClass('loading');

            let name = $(ev.currentTarget).data('name');
            let value = $(ev.currentTarget).text();

            $.post('/changecvar', { name: name, value: value }, (result) => {
                $(ev.currentTarget).removeClass('loading');
                if (result.success) {
                    $(ev.currentTarget).addClass('success');
                    setTimeout(() => $(ev.currentTarget).addClass('success'), 800);
                } else {
                    $(ev.currentTarget).addClass('error');
                }
            })
        }
    });

    /*
        Event Listener to handle changing Config Vars
    */
   $(document).on('keydown', '.cfgvars .option-value:not(.readonly)', (ev) => {
        if (ev.keyCode == 13) {
            $(ev.currentTarget).attr('contenteditable', 'false').blur();
            $(ev.currentTarget).addClass('loading');

            let name = $(ev.currentTarget).data('name');
            let value = $(ev.currentTarget).text();

            $.post('/changecfgvar', { name: name, value: value }, (result) => {
                $(ev.currentTarget).removeClass('loading');
                if (result.success) {
                    $(ev.currentTarget).addClass('success');
                    setTimeout(() => $(ev.currentTarget).addClass('success'), 800);
                } else {
                    $(ev.currentTarget).addClass('error');
                }
            })
        }
   });
    
    $(document).on('click', '.action-button', (ev) => {
        let name = $(ev.currentTarget).data('name');
        $(ev.currentTarget).addClass('loading');

        $.post('/runcommand', { name: name }, (result) => {
            $(ev.currentTarget).removeClass('loading');

            if (result.success) {
                $(ev.currentTarget).addClass('success');
                setTimeout(() => $(ev.currentTarget).addClass('success'), 800);
                pausePolling(5000);

                $('#server-status').text(result.output);
            } else {
                $(ev.currentTarget).addClass('error');
            }
        });
    });

    statusPoll();
});

let statusPollTimeout;
function statusPoll() {
    $.get('/serverstatus', (result) => {
        $('#server-status').text(result);

        statusPollTimeout = setTimeout(statusPoll, 5000);
    });
}

function pausePolling(ms) {
    clearTimeout(statusPollTimeout);

    statusPollTimeout = setTimeout(statusPoll, ms);
}

function populateConfigs(data) {
    let result = "";
    for (let config of data) {
        result += `
        <div data-name="${config.name}" class="config darkbox ${config.active ? "active" : ""}">
            <p>${config.name}</p>
        </div>
        `
    }
    $('.configs').html(result);
    $('.interface').fadeIn();
}

function populateCvars(data) {
    let result = "";
    for (let cvar of data) {
        result += `
        <tr class="option">
            <td class="option-name">${cvar.name}</td>
            <td data-name="${cvar.name}" class="option-value ${cvar.readonly ? "readonly" : ""}">${cvar.value}</td>
        </tr>
        `
    }

    $('.cvars').html(result);
}

function populateConfigVars(data) {
    let result = "";
    for (let cvar of data) {
        result += `
        <tr class="option">
            <td class="option-name">${cvar.name}</td>
            <td data-name="${cvar.name}" class="option-value">${cvar.value}</td>
        </tr>
        `
    }

    $('.cfgvars').html(result);
}

function populateButtons(data) {
    let result = "";
    for (let action of data) {
        console.log(action);
        result += `
        <a class="action-button" data-name="${action.name}">${action.label}</a>
        `;
    }

    $('.actions').html(result);
}