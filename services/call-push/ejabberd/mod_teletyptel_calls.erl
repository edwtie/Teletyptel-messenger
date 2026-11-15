-module(mod_teletyptel_calls).
-behaviour(gen_mod).
-behaviour(gen_server).
-compile({no_auto_import, [now/0]}).
-include_lib("xmpp/include/xmpp.hrl").
-include_lib("kernel/include/file.hrl").
-export([start/2, stop/1, reload/3, depends/2, mod_options/1, mod_opt_type/1, mod_doc/0]).
-export([init/1, terminate/2, handle_call/3, handle_cast/2, handle_info/2, code_change/3, format_status/1]).
-export([session_opened/1, session_closed/2, user_send/1, check_session/3]).
-define(NS, <<"urn:teletyptel:call-recovery:1">>).
-define(JMI, <<"urn:xmpp:jingle-message:0">>).
-define(RTP, <<"urn:xmpp:jingle:apps:rtp:1">>).
-define(RTT, <<"urn:xmpp:jingle:apps:rtt-sync:0">>).

start(Host, Opts) -> gen_mod:start_child(?MODULE, Host, Opts).
stop(Host) -> gen_mod:stop_child(?MODULE, Host).
reload(Host, _, _) -> gen_server:cast(proc(Host), shutdown).
depends(_, _) -> [{mod_privacy, hard}, {mod_blocking, hard}].
mod_options(_) -> [].
mod_opt_type(_) -> econf:binary().
mod_doc() -> #{desc => <<"Opt-in local signed call-event producer. No APNs transport.">>}.
proc(Host) -> gen_mod:get_module_proc(Host, ?MODULE).

init(Arguments) ->
    try initialize(Arguments) catch _:_ -> {stop, signaling_unavailable} end.
format_status(Status) -> Status#{state => redacted}.

initialize([Host | _]) ->
    true = os:getenv("TELETYPTEL_CALL_SIGNALING") =:= "1",
    Environment = list_to_binary(os:getenv("TELETYPTEL_CALL_PUSH_ENVIRONMENT", "")),
    true = lists:member(Environment, [<<"sandbox">>, <<"production">>]),
    Host = list_to_binary(os:getenv("TELETYPTEL_CALL_SIGNALING_DOMAIN", "")),
    Issuer = list_to_binary(os:getenv("TELETYPTEL_CALL_SIGNALING_ISSUER", "")),
    match = re:run(Issuer, <<"^[A-Za-z0-9_-]{1,64}$">>, [{capture, none}]),
    KeyFile = protected_path("TELETYPTEL_CALL_SIGNALING_KEY_FILE", regular),
    Spool = protected_path("TELETYPTEL_CALL_SIGNALING_SPOOL", directory),
    {ok, Encoded} = file:read_file(KeyFile),
    true = byte_size(Encoded) =< 128,
    Key = base64:decode(string:trim(Encoded)),
    32 = byte_size(Key),
    create_table(teletyptel_call_preferences, [owner, enabled, dnd, muted]),
    create_table(teletyptel_call_counter, [host, value]),
    ok = mnesia:wait_for_tables([teletyptel_call_preferences, teletyptel_call_counter], 5000),
    case mnesia:dirty_read(teletyptel_call_counter, Host) of
        [] -> mnesia:dirty_write({teletyptel_call_counter, Host, erlang:system_time(microsecond)});
        _ -> ok
    end,
    hooks(add, Host),
    erlang:send_after(10000, self(), refresh),
    {ok, #{host => Host, environment => Environment, issuer => Issuer, key => Key,
           spool => Spool, resources => #{}, calls => #{}}}.

protected_path(Variable, Type) ->
    Path = os:getenv(Variable, ""),
    absolute = filename:pathtype(Path),
    {ok, #file_info{type = Type, mode = Mode}} = file:read_link_info(Path),
    0 = Mode band 8#077,
    {ok, Canonical} = file:read_file_info(Path),
    Type = Canonical#file_info.type,
    Path.

create_table(Table, Attributes) ->
    case mnesia:create_table(Table, [{attributes, Attributes}, {disc_copies, [node()]}]) of
        {atomic, ok} -> ok;
        {aborted, {already_exists, Table}} -> ok;
        _ -> error(storage_unavailable)
    end.

hooks(Action, Host) ->
    lists:foreach(fun({Name, Function}) ->
        apply(ejabberd_hooks, Action, [Name, Host, ?MODULE, Function, 90])
    end, [{c2s_session_opened, session_opened}, {c2s_terminated, session_closed},
          {user_send_packet, user_send}, {c2s_handle_call, check_session}]).

session_opened(#{jid := JID, lserver := Host} = State) ->
    cast(Host, {online, self(), JID}), State;
session_opened(State) -> State.
session_closed(#{jid := JID, lserver := Host} = State, _) ->
    cast(Host, {offline, self(), JID}), State;
session_closed(State, _) -> State.

cast(Host, Event) ->
    case whereis(proc(Host)) of
        undefined -> ok;
        Pid -> case process_info(Pid, message_queue_len) of
            {message_queue_len, Count} when Count < 256 -> gen_server:cast(Pid, Event);
            _ -> ok
        end
    end.

user_send({Packet, #{jid := JID, lserver := Host} = State} = Acc) ->
    try
        true = xmpp:get_from(Packet) =:= JID,
        case Packet of
            #iq{type = set, to = #jid{luser = <<>>, lserver = Host}, sub_els = [Element]} ->
                case xmpp:encode(Element) of
                    #xmlel{attrs = Attrs} = Raw ->
                        case proplists:get_value(<<"xmlns">>, Attrs) of
                            ?NS -> control(Packet, Raw, State);
                            _ -> Acc
                        end
                end;
            #message{type = chat, to = #jid{lserver = Host, luser = User}} when User =/= <<>> ->
                case intent(Packet) of
                    {Action, SID, Profile} ->
                        allow = privacy(State, Packet, out),
                        cast(Host, {intent, JID, xmpp:get_to(Packet), Action, SID, Profile, erlang:system_time(second)});
                    none -> ok
                end,
                Acc;
            _ -> Acc
        end
    catch _:_ -> Acc end;
user_send(Acc) -> Acc.

control(IQ, #xmlel{name = <<"preferences">>, attrs = Attrs, children = Children}, State) ->
    true = lists:sort([Name || {Name, _} <- Attrs]) =:= [<<"dnd">>, <<"enabled">>, <<"xmlns">>],
    Enabled = boolean(proplists:get_value(<<"enabled">>, Attrs)),
    DND = boolean(proplists:get_value(<<"dnd">>, Attrs)),
    true = length(Children) =< 256,
    Host = maps:get(lserver, State), JID = maps:get(jid, State),
    Muted = [begin
        #xmlel{name = <<"muted">>, attrs = [{<<"jid">>, Peer}], children = []} = Child,
        #jid{lserver = Host, luser = User, lresource = <<>>} = jid:decode(Peer),
        true = User =/= <<>>, Peer
    end || Child <- Children],
    Owner = jid:encode(jid:remove_resource(JID)),
    mnesia:dirty_write({teletyptel_call_preferences, Owner, Enabled, DND, lists:usort(Muted)}),
    cast(Host, refresh),
    {drop, ejabberd_c2s:send(State, xmpp:make_iq_result(IQ))};
control(IQ, #xmlel{name = <<"handoff">>, attrs = Attrs, children = []}, State) ->
    true = lists:sort([Name || {Name, _} <- Attrs]) =:= [<<"callId">>, <<"deviceId">>, <<"generation">>, <<"sid">>, <<"xmlns">>],
    Values = maps:from_list(Attrs),
    match = re:run(maps:get(<<"callId">>, Values), uuid_pattern(), [{capture, none}]),
    match = re:run(maps:get(<<"deviceId">>, Values), uuid_pattern(), [{capture, none}]),
    match = re:run(maps:get(<<"generation">>, Values), <<"^[0-9a-f]{32}$">>, [{capture, none}]),
    true = valid_sid(maps:get(<<"sid">>, Values)),
    cast(maps:get(lserver, State), {handoff, maps:get(jid, State), maps:remove(<<"xmlns">>, Values), erlang:system_time(second)}),
    {drop, ejabberd_c2s:send(State, xmpp:make_iq_result(IQ))};
control(IQ, _, State) -> {drop, ejabberd_c2s:send(State, xmpp:make_error(IQ, xmpp:err_bad_request()))}.

uuid_pattern() -> <<"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$">>.
boolean(<<"true">>) -> true;
boolean(<<"false">>) -> false.
valid_sid(SID) when is_binary(SID) -> re:run(SID, <<"^[A-Za-z0-9_-]{1,128}$">>, [{capture, none}]) =:= match;
valid_sid(_) -> false.

intent(Packet) ->
    #xmlel{children = Children} = xmpp:encode(Packet),
    Matches = [Element || #xmlel{attrs = Attrs} = Element <- Children,
                         proplists:get_value(<<"xmlns">>, Attrs) =:= ?JMI],
    case Matches of
        [#xmlel{name = Action, attrs = Attrs, children = Descriptions}] ->
            SID = proplists:get_value(<<"id">>, Attrs),
            case valid_sid(SID) andalso lists:member(Action, [<<"propose">>, <<"retract">>, <<"reject">>, <<"finish">>]) of
                true when Action =:= <<"propose">> -> {Action, SID, media_profile(Descriptions)};
                true -> {Action, SID, <<"audio">>};
                false -> none
            end;
        _ -> none
    end.

media_profile(Descriptions) ->
    Media = lists:sort([case Description of
        #xmlel{name = <<"description">>, attrs = Attrs, children = []} ->
            case {proplists:get_value(<<"xmlns">>, Attrs), proplists:get_value(<<"media">>, Attrs)} of
                {?RTP, <<"audio">>} -> audio;
                {?RTP, <<"video">>} -> video;
                {?RTT, undefined} -> rtt
            end
    end || Description <- Descriptions]),
    case Media of
        [audio] -> <<"audio">>;
        [audio, video] -> <<"video">>;
        [audio, rtt] -> <<"audio-rtt">>;
        [audio, rtt, video] -> <<"total">>
    end.

privacy(StateOrJID, Packet, Direction) ->
    JID = case StateOrJID of #{jid := Value} -> Value; Value -> Value end,
    case mod_privacy:get_user_list(JID#jid.luser, JID#jid.lserver, default) of
        {error, _} -> deny;
        _ -> ejabberd_hooks:run_fold(privacy_check_packet, JID#jid.lserver, allow, [StateOrJID, Packet, Direction])
    end.

check_session(#{jid := JID} = State, {teletyptel_call_check, Peer}, From) ->
    Result = try
        #jid{} = Peer,
        Packet = #message{type = chat, from = JID, to = Peer},
        Show = case maps:get(pres_last, State, undefined) of #presence{show = Value} -> Value; _ -> undefined end,
        Show =/= dnd andalso privacy(State, Packet, out) =:= allow
            andalso privacy(State, xmpp:set_from_to(Packet, Peer, JID), in) =:= allow
    catch _:_ -> false end,
    ejabberd_c2s:reply(From, Result), {stop, State};
check_session(State, _, _) -> State.

handle_call(_, _, State) -> {reply, {error, unsupported}, State}.
handle_cast(shutdown, State) -> {stop, normal, State};
handle_cast({online, Pid, JID}, #{resources := Resources} = State) when map_size(Resources) < 1024 ->
    Encoded = jid:encode(JID),
    case maps:get(Encoded, Resources, undefined) of {Pid, _} -> {noreply, State};
        _ ->
            Reference = erlang:monitor(process, Pid),
            emit(#{type => <<"resource">>, jid => Encoded, online => true, expiresAt => now() + 25}, State),
            {noreply, State#{resources => Resources#{Encoded => {Pid, Reference}}}}
    end;
handle_cast({offline, Pid, JID}, State) -> {noreply, offline(Pid, jid:encode(JID), State)};
handle_cast(refresh, State) -> {noreply, refresh(State)};
handle_cast({intent, Caller, Recipient, Action, SID, Profile, Observed}, State) ->
    Next = try
        true = now() - Observed >= 0 andalso now() - Observed =< 2,
        process_intent(Caller, Recipient, Action, SID, Profile, State)
    catch _:_ -> State end,
    {noreply, Next};
handle_cast({handoff, JID, Values, Observed}, State) ->
    try
        true = now() - Observed >= 0 andalso now() - Observed =< 2,
        SID = maps:get(<<"sid">>, Values),
        [Call] = [Call || {{_, CallSID}, Call} <- maps:to_list(maps:get(calls, State)), CallSID =:= SID,
                         maps:get(recipient, Call) =:= jid:remove_resource(JID), maps:get(expires, Call) > now()],
        true = pair_allowed(maps:get(caller, Call), JID),
        true = resource_live(JID),
        emit(#{type => <<"resource">>, jid => jid:encode(JID), online => true, expiresAt => now() + 25}, State),
        emit(#{type => <<"handoff">>, jid => jid:encode(JID), sid => SID,
               callId => maps:get(<<"callId">>, Values), deviceId => maps:get(<<"deviceId">>, Values),
               generation => maps:get(<<"generation">>, Values), expiresAt => now() + 10}, State)
    catch _:_ -> ok end,
    {noreply, State};
handle_cast(_, State) -> {noreply, State}.

process_intent(Caller, Recipient, <<"propose">>, SID, Profile, #{calls := Calls, resources := Resources} = State) ->
    true = Recipient#jid.lresource =:= <<>>,
    true = Caller#jid.luser =/= Recipient#jid.luser,
    true = map_size(Calls) < 256,
    {Pid, _} = maps:get(jid:encode(Caller), Resources),
    true = is_process_alive(Pid) andalso resource_live(Caller),
    Key = {jid:encode(Caller), SID},
    false = maps:is_key(Key, Calls),
    true = pair_allowed(Caller, Recipient),
    emit_pair(Caller, Recipient, true, State),
    emit(#{type => <<"offer">>, caller => jid:encode(Caller), recipient => jid:encode(Recipient),
           sid => SID, mediaProfile => Profile, expiresAt => now() + 45}, State),
    State#{calls => Calls#{Key => #{caller => Caller, recipient => Recipient, expires => now() + 45}}};
process_intent(Actor, Peer, Action, SID, _, #{calls := Calls} = State) ->
    Matches = [{Key, Call} || {Key = {_, CallSID}, Call} <- maps:to_list(Calls), CallSID =:= SID,
        ((maps:get(caller, Call) =:= Actor andalso maps:get(recipient, Call) =:= jid:remove_resource(Peer)) orelse
         (maps:get(recipient, Call) =:= jid:remove_resource(Actor) andalso maps:get(caller, Call) =:= Peer))],
    lists:foreach(fun({_, Call}) ->
        true = lists:member(Action, [<<"retract">>, <<"reject">>, <<"finish">>]),
        emit(#{type => <<"end">>, caller => jid:encode(maps:get(caller, Call)), recipient => jid:encode(maps:get(recipient, Call)),
               actor => jid:encode(Actor), sid => SID}, State)
    end, Matches),
    State#{calls => lists:foldl(fun({Key, _}, Acc) -> maps:remove(Key, Acc) end, Calls, Matches)}.

now() -> erlang:system_time(second).
resource_live(#jid{luser = User, lserver = Host, lresource = Resource}) ->
    case ejabberd_sm:get_session_pid(User, Host, Resource) of Pid when is_pid(Pid) -> is_process_alive(Pid); _ -> false end.

owner_allowed(Owner, Peer) ->
    OwnerBare = jid:encode(jid:remove_resource(Owner)), PeerBare = jid:encode(jid:remove_resource(Peer)),
    case mnesia:dirty_read(teletyptel_call_preferences, OwnerBare) of
        [{teletyptel_call_preferences, OwnerBare, true, false, Muted}] ->
            Packet = #message{type = chat, from = Owner, to = Peer},
            not lists:member(PeerBare, Muted) andalso privacy(Owner, Packet, out) =:= allow
                andalso privacy(Owner, xmpp:set_from_to(Packet, Peer, Owner), in) =:= allow
                andalso lists:all(fun(Resource) ->
                    case ejabberd_sm:get_session_pid(Owner#jid.luser, Owner#jid.lserver, Resource) of
                        Pid when is_pid(Pid) -> ejabberd_c2s:call(Pid, {teletyptel_call_check, Peer}, 1000) =:= true;
                        _ -> false
                    end
                end, ejabberd_sm:get_user_resources(Owner#jid.luser, Owner#jid.lserver));
        _ -> false
    end.
pair_allowed(Caller, Recipient) ->
    try owner_allowed(Caller, Recipient) andalso owner_allowed(Recipient, Caller) catch _:_ -> false end.
emit_pair(Caller, Recipient, Allowed, State) ->
    lists:foreach(fun({Owner, Peer}) -> emit(#{type => <<"policy">>, owner => jid:encode(jid:remove_resource(Owner)),
        peer => jid:encode(jid:remove_resource(Peer)), allowed => Allowed, expiresAt => now() + 25}, State)
    end, [{Caller, Recipient}, {Recipient, Caller}]).

offline(Pid, Encoded, #{resources := Resources, calls := Calls} = State) ->
    case maps:get(Encoded, Resources, undefined) of
        {Pid, Reference} ->
            erlang:demonitor(Reference, [flush]),
            emit(#{type => <<"resource">>, jid => Encoded, online => false, expiresAt => now() + 25}, State),
            State#{resources => maps:remove(Encoded, Resources),
                   calls => maps:filter(fun({Caller, _}, _) -> Caller =/= Encoded end, Calls)};
        _ -> State
    end.

refresh(#{calls := Calls, resources := Resources} = State) ->
    maps:foreach(fun(Encoded, {Pid, _}) ->
        case is_process_alive(Pid) of
            true -> emit(#{type => <<"resource">>, jid => Encoded, online => true, expiresAt => now() + 25}, State);
            false -> ok
        end
    end, Resources),
    Retained = maps:filter(fun(_, Call) ->
        case maps:get(expires, Call) > now() of
            false -> false;
            true ->
                Caller = maps:get(caller, Call), Recipient = maps:get(recipient, Call),
                Allowed = resource_live(Caller) andalso pair_allowed(Caller, Recipient),
                emit_pair(Caller, Recipient, Allowed, State), Allowed
        end
    end, Calls),
    State#{calls => Retained}.

emit(Event, State) ->
    try
        Spool = maps:get(spool, State),
        {ok, Files} = file:list_dir(Spool),
        true = length(Files) < 4096,
        Host = maps:get(host, State),
        Revision = mnesia:dirty_update_counter(teletyptel_call_counter, Host, 1),
        true = Revision > 0 andalso Revision < 9007199254740991,
        Nonce = string:lowercase(binary:encode_hex(crypto:strong_rand_bytes(16))),
        Body = #{version => 1, issuer => maps:get(issuer, State), timestamp => now(), nonce => Nonce,
                 event => Event#{revision => Revision}},
        Payload = base64:encode(jiffy:encode(Body)),
        Signed = iolist_to_binary([<<"teletyptel-call-signaling-v1:">>, maps:get(environment, State), <<":">>, Host,
                                  <<":">>, maps:get(issuer, State), <<":">>, Payload]),
        Signature = string:lowercase(binary:encode_hex(crypto:mac(hmac, sha256, maps:get(key, State), Signed))),
        Name = lists:flatten(io_lib:format("~20..0B_~s.json", [Revision, Nonce])),
        Temporary = filename:join(Spool, "." ++ Name), Destination = filename:join(Spool, Name),
        {ok, File} = file:open(Temporary, [write, exclusive, binary, raw]),
        try
            ok = file:change_mode(Temporary, 8#600),
            ok = file:write(File, jiffy:encode(#{payload => Payload, signature => Signature})),
            ok = file:sync(File)
        after file:close(File) end,
        ok = file:rename(Temporary, Destination), ok
    catch _:_ -> error(signaling_unavailable) end.

handle_info(refresh, State) ->
    Next = try refresh(State) catch _:_ -> State end,
    erlang:send_after(10000, self(), refresh), {noreply, Next};
handle_info({'DOWN', Reference, process, Pid, _}, #{resources := Resources} = State) ->
    Next = lists:foldl(fun({Encoded, {ResourcePid, ResourceRef}}, Acc) ->
        case {ResourcePid, ResourceRef} of {Pid, Reference} -> offline(Pid, Encoded, Acc); _ -> Acc end
    end, State, maps:to_list(Resources)), {noreply, Next};
handle_info(_, State) -> {noreply, State}.
terminate(_, #{host := Host}) -> hooks(delete, Host).
code_change(_, State, _) -> {ok, State}.
