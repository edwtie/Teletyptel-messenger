-module(ejabberd_auth_teletyptel_calls).
-behaviour(ejabberd_auth).
-include_lib("xmpp/include/xmpp.hrl").
-include_lib("kernel/include/file.hrl").
-export([start/1, stop/1, check_password/4, store_type/1, plain_password_required/1, user_exists/2, use_cache/1]).
-export([auth_result/3, bind/1, send_packet/1, filter_send/1, authenticated/2, unbound/2, inline/1, info/2, terminated/2,
         stream_started/2, revoke_device/3, attest_websocket/1, init_transport/2]).
-define(TABLE, teletyptel_call_bootstrap).
-define(NS, <<"urn:teletyptel:call-recovery:1">>).
-define(JMI, <<"urn:xmpp:jingle-message:0">>).

start(Host) ->
    true = os:getenv("TELETYPTEL_CALL_SCOPED_AUTH") =:= "1",
    Host = list_to_binary(os:getenv("TELETYPTEL_CALL_SCOPED_DOMAIN", "")),
    Environment = list_to_binary(os:getenv("TELETYPTEL_CALL_SCOPED_ENVIRONMENT", "")),
    true = lists:member(Environment, [<<"production">>, <<"sandbox">>]),
    Issuer = list_to_binary(os:getenv("TELETYPTEL_CALL_SCOPED_ISSUER", "")),
    match = re:run(Issuer, <<"\\A[A-Za-z0-9_-]{1,64}\\z">>, [{capture, none}]),
    File = os:getenv("TELETYPTEL_CALL_SCOPED_KEY_FILE", ""),
    absolute = filename:pathtype(File),
    {ok, #file_info{type = regular, mode = Mode, size = Size}} = file:read_link_info(File),
    0 = Mode band 8#077, true = Size =< 128,
    {ok, Encoded} = file:read_file(File), Key = base64:decode(string:trim(Encoded)), 32 = byte_size(Key),
    case mnesia:create_table(?TABLE, [{attributes, [id, pid, device, generation, expires]}, {disc_copies, [node()]}]) of
        {atomic, ok} -> ok; {aborted, {already_exists, ?TABLE}} -> ok
    end,
    ok = mnesia:wait_for_tables([?TABLE], 5000),
    persistent_term:put({?MODULE, Host}, #{key => Key, environment => Environment, issuer => Issuer}),
    hooks(add, Host), ok.

stop(Host) -> hooks(delete, Host), persistent_term:erase({?MODULE, Host}), ok.
store_type(_) -> external.
plain_password_required(_) -> true.
use_cache(_) -> false.
user_exists(_, _) -> {nocache, false}.

hooks(Action, Host) ->
    apply(ejabberd_hooks, Action, [c2s_init, ?MODULE, init_transport, 1]),
    lists:foreach(fun({Hook, Function}) -> apply(ejabberd_hooks, Action, [Hook, Host, ?MODULE, Function, 1]) end,
        [{c2s_stream_started, stream_started}, {c2s_auth_result, auth_result}, {c2s_handle_bind, bind}, {user_send_packet, send_packet},
         {c2s_filter_send, filter_send}, {c2s_authenticated_packet, authenticated}, {c2s_unbinded_packet, unbound},
         {c2s_handle_sasl2_inline, inline}, {c2s_handle_info, info}, {c2s_terminated, terminated}]).

check_password(User, Authz, Host, <<"tcr1.", _/binary>> = Credential) ->
    erase({?MODULE, grant}),
    try
        Host = erase({?MODULE, transport}),
        true = Authz =:= <<>> orelse Authz =:= User,
        true = ejabberd_auth:user_exists_in_other_modules(?MODULE, User, Host) =:= true,
        false = gen_mod:is_loaded(Host, mod_auth_fast),
        false = gen_mod:is_loaded(Host, mod_sasl2),
        Claims = claims(Credential, User, Host),
        Id = {Host, maps:get(<<"nonce">>, Claims)},
        {atomic, ok} = mnesia:transaction(fun() ->
            mnesia:write_lock_table(?TABLE),
            lists:foreach(fun({?TABLE, Old, _, _, _, Expires}) ->
                case Expires + 60 < erlang:system_time(second) of true -> mnesia:delete({?TABLE, Old}); false -> ok end
            end, mnesia:match_object({?TABLE, '_', '_', '_', '_', '_'})),
            true = mnesia:table_info(?TABLE, size) < 4096,
            [] = mnesia:read(?TABLE, {Host, {revoked, maps:get(<<"deviceId">>, Claims), maps:get(<<"generation">>, Claims)}}, read),
            [] = mnesia:read(?TABLE, Id, write),
            mnesia:write({?TABLE, Id, self(), maps:get(<<"deviceId">>, Claims), maps:get(<<"generation">>, Claims), maps:get(<<"expiresAt">>, Claims)})
        end),
        put({?MODULE, grant}, Claims), {nocache, {stop, true}}
    catch _:_ -> {nocache, {stop, false}} end;
check_password(_, _, _, _) -> erase({?MODULE, grant}), erase({?MODULE, transport}), {nocache, false}.

stream_started(#{lserver := Host, stream_encrypted := true} = State, _) ->
    case maps:get(auth_module, State, undefined) of undefined -> put({?MODULE, transport}, Host); _ -> erase({?MODULE, transport}) end,
    State;
stream_started(#{lserver := Host, teletyptel_wss_verified := true} = State, _) ->
    case maps:get(auth_module, State, undefined) of undefined -> put({?MODULE, transport}, Host); _ -> erase({?MODULE, transport}) end,
    State;
stream_started(State, _) -> erase({?MODULE, transport}), State.

attest_websocket(IP) ->
    Host = list_to_binary(os:getenv("TELETYPTEL_CALL_SCOPED_DOMAIN", "")),
    Stamp = integer_to_binary(erlang:system_time(second)), Nonce = string:lowercase(binary:encode_hex(crypto:strong_rand_bytes(16))),
    <<Stamp/binary, ".", Nonce/binary, ".", (websocket_mac(Host, IP, Stamp, Nonce))/binary>>.

websocket_mac(Host, IP, Stamp, Nonce) ->
    #{key := Key, environment := Environment, issuer := Issuer} = persistent_term:get({?MODULE, Host}),
    string:lowercase(binary:encode_hex(crypto:mac(hmac, sha256, Key,
        <<"teletyptel-wss-v1:", Environment/binary, ":", Host/binary, ":", Issuer/binary, ":", Stamp/binary, ":", Nonce/binary, ":", (term_to_binary(IP))/binary>>))).

init_transport({ok, #{ip := IP, socket := Socket} = State}, Options) ->
    try
        websocket = xmpp_socket:get_transport(Socket),
        Headers = proplists:get_value(headers, proplists:get_value(http, Options, []), []),
        Token = proplists:get_value(<<"x-teletyptel-tls-attestation">>, Headers),
        [Stamp, Nonce, Signature] = binary:split(Token, <<".">>, [global]),
        true = abs(erlang:system_time(second) - binary_to_integer(Stamp)) =< 5,
        match = re:run(Nonce, <<"\\A[0-9a-f]{32}\\z">>, [{capture, none}]),
        Host = list_to_binary(os:getenv("TELETYPTEL_CALL_SCOPED_DOMAIN", "")),
        true = crypto:hash_equals(websocket_mac(Host, IP, Stamp, Nonce), Signature),
        {atomic, ok} = mnesia:transaction(fun() ->
            mnesia:write_lock_table(?TABLE),
            lists:foreach(fun({?TABLE, Old, _, _, _, Expires}) ->
                case Expires < erlang:system_time(second) of true -> mnesia:delete({?TABLE, Old}); false -> ok end
            end, mnesia:match_object({?TABLE, {Host, {wss, '_'}}, '_', '_', '_', '_'})),
            true = mnesia:table_info(?TABLE, size) < 4096,
            Id = {Host, {wss, Nonce}}, [] = mnesia:read(?TABLE, Id, write),
            mnesia:write({?TABLE, Id, self(), <<>>, <<>>, erlang:system_time(second) + 5})
        end),
        {ok, State#{teletyptel_wss_verified => true}}
    catch _:_ -> {ok, State} end;
init_transport(Value, _) -> Value.

claims(Credential, User, Host) ->
    true = byte_size(Credential) =< 1024,
    [<<"tcr1">>, Payload, Signature] = binary:split(Credential, <<".">>, [global]),
    match = re:run(Payload, <<"\\A[A-Za-z0-9_-]+\\z">>, [{capture, none}]),
    match = re:run(Signature, <<"\\A[0-9a-f]{64}\\z">>, [{capture, none}]),
    #{key := Key, environment := Environment, issuer := Issuer} = persistent_term:get({?MODULE, Host}),
    Expected = string:lowercase(binary:encode_hex(crypto:mac(hmac, sha256, Key,
        <<"teletyptel-call-xmpp-v1:", Environment/binary, ":", Host/binary, ":", Issuer/binary, ":", Payload/binary>>))),
    true = crypto:hash_equals(Expected, Signature),
    Translated = binary:replace(binary:replace(Payload, <<"-">>, <<"+">>, [global]), <<"_">>, <<"/">>, [global]),
    Padded = <<Translated/binary, (binary:copy(<<"=">>, (4 - byte_size(Translated) rem 4) rem 4))/binary>>,
    Value = jiffy:decode(base64:decode(Padded), [return_maps]),
    Fields = [<<"version">>, <<"scope">>, <<"environment">>, <<"domain">>, <<"issuer">>, <<"owner">>, <<"peer">>, <<"callId">>, <<"sid">>,
              <<"deviceId">>, <<"generation">>, <<"profile">>, <<"nonce">>, <<"resource">>, <<"issuedAt">>, <<"expiresAt">>],
    true = lists:sort(maps:keys(Value)) =:= lists:sort(Fields),
    1 = maps:get(<<"version">>, Value), <<"call-xmpp-bootstrap-v1">> = maps:get(<<"scope">>, Value),
    Environment = maps:get(<<"environment">>, Value), Issuer = maps:get(<<"issuer">>, Value), Host = maps:get(<<"domain">>, Value),
    Owner = <<User/binary, "@", Host/binary>>, Owner = maps:get(<<"owner">>, Value),
    #jid{luser = PeerUser, lserver = Host, lresource = Resource} = jid:decode(maps:get(<<"peer">>, Value)),
    true = PeerUser =/= User andalso PeerUser =/= <<>> andalso Resource =/= <<>>,
    true = byte_size(maps:get(<<"peer">>, Value)) =< 512,
    match = re:run(maps:get(<<"sid">>, Value), <<"\\A[A-Za-z0-9_-]{1,128}\\z">>, [{capture, none}]),
    lists:foreach(fun(Name) -> match = re:run(maps:get(Name, Value), <<"\\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\z">>, [{capture, none}]) end,
        [<<"callId">>, <<"deviceId">>]),
    lists:foreach(fun(Name) -> match = re:run(maps:get(Name, Value), <<"\\A[0-9a-f]{32}\\z">>, [{capture, none}]) end, [<<"nonce">>, <<"generation">>]),
    Nonce = maps:get(<<"nonce">>, Value), <<"tc-call-", Nonce/binary>> = maps:get(<<"resource">>, Value),
    true = lists:member(maps:get(<<"profile">>, Value), [<<"audio">>, <<"video">>, <<"audio-rtt">>, <<"total">>]),
    Issued = maps:get(<<"issuedAt">>, Value), Expires = maps:get(<<"expiresAt">>, Value), Now = erlang:system_time(second),
    true = is_integer(Issued) andalso is_integer(Expires) andalso Issued =< Now andalso Now - Issued =< 20 andalso Expires > Now andalso Expires =< Issued + 20,
    Value.

auth_result(#{auth_module := ?MODULE} = State, true, _) ->
    case {erase({?MODULE, grant}), maps:get(stream_encrypted, State, false) orelse maps:get(teletyptel_wss_verified, State, false)} of
        {Claims, true} when is_map(Claims) ->
            erlang:send_after(max(1, (maps:get(<<"expiresAt">>, Claims) - erlang:system_time(second)) * 1000), self(), {teletyptel_scope_expired, maps:get(<<"nonce">>, Claims)}),
            {stop, State#{teletyptel_scope => Claims, teletyptel_out => #{}, teletyptel_in => #{}}};
        _ -> {stop, close(State)}
    end;
auth_result(State, _, _) -> erase({?MODULE, grant}), State.

bind({Resource, {ok, #{auth_module := ?MODULE, teletyptel_scope := Claims} = State}}) ->
    case valid(State) andalso Resource =:= maps:get(<<"resource">>, Claims) of
        true -> {stop, {Resource, {ok, State}}};
        false -> {stop, {Resource, {error, xmpp:err_not_allowed(), close(State)}}}
    end;
bind({Resource, {ok, #{auth_module := ?MODULE} = State}}) -> {stop, {Resource, {error, xmpp:err_not_allowed(), close(State)}}};
bind(Value) -> Value.

valid(#{lserver := Host, teletyptel_scope := Claims}) ->
    try
        true = maps:get(<<"expiresAt">>, Claims) > erlang:system_time(second),
        [{?TABLE, _, Pid, _, _, _}] = mnesia:dirty_read(?TABLE, {Host, maps:get(<<"nonce">>, Claims)}),
        Pid =:= self()
    catch _:_ -> false end;
valid(_) -> false.

close(State) -> ejabberd_c2s:stop_async(self()), State.
authenticated(#{auth_module := ?MODULE, teletyptel_scope := Claims, lserver := Host} = State,
    #iq{type = set, id = Id, from = From, to = To,
        sub_els = [#xmlel{name = <<"authorize">>, attrs = [{<<"xmlns">>, ?NS}], children = [{xmlcdata, Token}]}]} = IQ) ->
    try
        true = valid(State), false = maps:get(teletyptel_answered, State, false),
        true = byte_size(Id) > 0 andalso byte_size(Id) =< 256,
        Own = <<(maps:get(<<"owner">>, Claims))/binary, "/", (maps:get(<<"resource">>, Claims))/binary>>,
        Own = jid:encode(From), Host = jid:encode(To),
        ok = answer_permit(Token, Claims, Host),
        Pending = maps:get(teletyptel_out, State), false = maps:is_key(Id, Pending), true = map_size(Pending) < 32,
        Authorized = State#{teletyptel_answered => true, teletyptel_out => Pending#{Id => Host}},
        {stop, ejabberd_c2s:send(Authorized, xmpp:make_iq_result(IQ))}
    catch _:_ -> {stop, close(State)} end;
authenticated(#{auth_module := ?MODULE} = State, Packet) ->
    try true = ?is_stanza(Packet) andalso valid(State), _ = permitted(Packet, State, out), State
    catch _:_ -> {stop, close(State)} end;
authenticated(State, _) -> State.

answer_permit(Token, Claims, Host) ->
    true = byte_size(Token) =< 1024,
    [<<"tca1">>, Payload, Signature] = binary:split(Token, <<".">>, [global]),
    match = re:run(Payload, <<"\\A[A-Za-z0-9_-]+\\z">>, [{capture, none}]),
    match = re:run(Signature, <<"\\A[0-9a-f]{64}\\z">>, [{capture, none}]),
    #{key := Key, environment := Environment, issuer := Issuer} = persistent_term:get({?MODULE, Host}),
    Expected = string:lowercase(binary:encode_hex(crypto:mac(hmac, sha256, Key,
        <<"teletyptel-call-answer-v1:", Environment/binary, ":", Host/binary, ":", Issuer/binary, ":", Payload/binary>>))),
    true = crypto:hash_equals(Expected, Signature),
    Translated = binary:replace(binary:replace(Payload, <<"-">>, <<"+">>, [global]), <<"_">>, <<"/">>, [global]),
    Value = jiffy:decode(base64:decode(<<Translated/binary, (binary:copy(<<"=">>, (4 - byte_size(Translated) rem 4) rem 4))/binary>>), [return_maps]),
    true = lists:sort(maps:keys(Value)) =:= lists:sort(maps:keys(Claims)),
    <<"call-xmpp-answer-v1">> = maps:get(<<"scope">>, Value),
    true = maps:without([<<"scope">>, <<"issuedAt">>, <<"expiresAt">>], Value) =:= maps:without([<<"scope">>, <<"issuedAt">>, <<"expiresAt">>], Claims),
    Issued = maps:get(<<"issuedAt">>, Value), Expires = maps:get(<<"expiresAt">>, Value), Now = erlang:system_time(second),
    true = is_integer(Issued) andalso is_integer(Expires) andalso Issued =< Now andalso Now - Issued =< 20
        andalso Expires > Now andalso Expires =< maps:get(<<"expiresAt">>, Claims), ok.
unbound(#{auth_module := ?MODULE} = State, _) -> {stop, close(State)};
unbound(State, _) -> State.
inline({#{auth_module := ?MODULE} = State, _, _}) -> {stop, {close(State), [], []}};
inline(Value) -> Value.
info(#{auth_module := ?MODULE} = State, {teletyptel_scope_expired, _}) -> {stop, close(State)};
info(State, _) -> State.
terminated(#{auth_module := ?MODULE} = State, _) -> erase({?MODULE, grant}), State;
terminated(State, _) -> State.

send_packet({Packet, #{auth_module := ?MODULE} = State}) -> filter(Packet, State, out);
send_packet(Value) -> Value.
filter_send({Packet, #{auth_module := ?MODULE} = State}) -> filter(Packet, State, in);
filter_send(Value) -> Value.
filter(Packet, State, Direction) ->
    try
        true = valid(State),
        Encoded = xmpp:encode(Packet), true = byte_size(fxml:element_to_binary(Encoded)) =< 32768,
        case handshake(Encoded, State, Direction) of
            true -> {Packet, State};
            false ->
                Next = permitted(Packet, State, Direction),
                {Packet, Next}
        end
    catch _:_ -> {stop, {drop, State}} end.

handshake(#xmlel{name = Name}, _, in) when Name =:= <<"success">>; Name =:= <<"stream:features">>; Name =:= <<"stream:stream">>;
                                                        Name =:= <<"stream:error">>; Name =:= <<"stream:close">> -> true;
handshake(#xmlel{name = <<"iq">>, attrs = Header, children = [#xmlel{name = <<"bind">>, attrs = Attrs, children = [#xmlel{name = <<"jid">>, children = [{xmlcdata, JID}]}]}]},
          #{teletyptel_scope := Claims, lserver := Host}, in) ->
    Expected = <<(maps:get(<<"owner">>, Claims))/binary, "/", (maps:get(<<"resource">>, Claims))/binary>>,
    proplists:get_value(<<"type">>, Header) =:= <<"result">> andalso
        lists:member(proplists:get_value(<<"from">>, Header), [undefined, Host]) andalso
        lists:member(proplists:get_value(<<"to">>, Header), [undefined, Expected, maps:get(<<"owner">>, Claims)]) andalso
        proplists:get_value(<<"xmlns">>, Attrs) =:= <<"urn:ietf:params:xml:ns:xmpp-bind">> andalso JID =:= Expected;
handshake(_, _, _) -> false.

permitted(#iq{type = Type, id = Id, from = From, to = To, sub_els = Els}, #{teletyptel_scope := Claims, lserver := Host} = State, Direction) ->
    true = is_binary(Id) andalso byte_size(Id) > 0 andalso byte_size(Id) =< 256,
    Own = <<(maps:get(<<"owner">>, Claims))/binary, "/", (maps:get(<<"resource">>, Claims))/binary>>,
    {Source, Destination, Requests, Responses} = case Direction of out -> {Own, jid:encode(To), teletyptel_out, teletyptel_in}; in -> {jid:encode(From), Own, teletyptel_in, teletyptel_out} end,
    true = jid:encode(From) =:= Source andalso jid:encode(To) =:= Destination,
    Other = case Direction of out -> Destination; in -> Source end,
    case Type of
        Result when Result =:= result; Result =:= error ->
            Pending = maps:get(Responses, State), Other = maps:get(Id, Pending),
            true = lists:all(fun(Element) -> reply_element(xmpp:encode(Element), Claims) end, Els),
            State#{Responses => maps:remove(Id, Pending)};
        _ ->
            Raw = [xmpp:encode(Element) || Element <- Els],
            true = case {Type, Other, Raw} of
                {get, Host, [#xmlel{name = <<"ping">>, attrs = [{<<"xmlns">>, <<"urn:xmpp:ping">>}], children = []}]} -> true;
                {set, Host, [Element]} when Direction =:= out -> handoff(Element, Claims);
                {set, _, [Element]} -> maps:get(teletyptel_answered, State, false) andalso Other =:= maps:get(<<"peer">>, Claims) andalso jingle(Element, Claims, Direction);
                _ -> false
            end,
            Pending = maps:get(Requests, State), true = map_size(Pending) < 32, false = maps:is_key(Id, Pending),
            State#{Requests => Pending#{Id => Other}}
    end;
permitted(#message{type = chat, from = From, to = To, body = [], subject = [], thread = undefined, sub_els = Els}, #{teletyptel_scope := Claims} = State, Direction) ->
    Own = <<(maps:get(<<"owner">>, Claims))/binary, "/", (maps:get(<<"resource">>, Claims))/binary>>, Peer = maps:get(<<"peer">>, Claims),
    true = case Direction of out -> jid:encode(From) =:= Own andalso jid:encode(To) =:= Peer; in -> jid:encode(From) =:= Peer andalso jid:encode(To) =:= Own end,
    Raw = [xmpp:encode(Element) || Element <- Els],
    [Intent] = [Element || #xmlel{attrs = Attrs} = Element <- Raw, proplists:get_value(<<"xmlns">>, Attrs) =:= ?JMI],
    true = intent(Intent, Claims, Direction),
    true = Direction =/= out orelse Intent#xmlel.name =/= <<"proceed">> orelse maps:get(teletyptel_answered, State, false),
    true = lists:all(fun(Element) -> Element =:= Intent orelse metadata(Element, Claims, Direction) end, Raw), State;
permitted(_, _, _) -> error(outside_call_scope).

handoff(#xmlel{name = <<"handoff">>, attrs = Attrs, children = []}, Claims) ->
    Values = maps:from_list(Attrs),
    Values =:= #{<<"xmlns">> => ?NS, <<"callId">> => maps:get(<<"callId">>, Claims), <<"sid">> => maps:get(<<"sid">>, Claims),
                  <<"deviceId">> => maps:get(<<"deviceId">>, Claims), <<"generation">> => maps:get(<<"generation">>, Claims)};
handoff(_, _) -> false.
jingle(#xmlel{name = <<"jingle">>, attrs = Attrs, children = Children}, Claims, Direction) ->
    Actions = case Direction of out -> [<<"session-accept">>, <<"session-info">>, <<"transport-info">>, <<"session-terminate">>];
                                  in -> [<<"session-initiate">>, <<"session-info">>, <<"transport-info">>, <<"session-terminate">>] end,
    Action = proplists:get_value(<<"action">>, Attrs),
    proplists:get_value(<<"xmlns">>, Attrs) =:= <<"urn:xmpp:jingle:1">> andalso proplists:get_value(<<"sid">>, Attrs) =:= maps:get(<<"sid">>, Claims)
        andalso lists:member(Action, Actions) andalso
        (not lists:member(Action, [<<"session-initiate">>, <<"session-accept">>]) orelse
            media_kinds([Description || #xmlel{name = <<"content">>, children = Content} <- Children,
                #xmlel{name = <<"description">>} = Description <- Content]) =:= profile(Claims));
jingle(_, _, _) -> false.
reply_element(#xmlel{name = <<"error">>}, _) -> true;
reply_element(#xmlel{name = <<"ping">>, attrs = [{<<"xmlns">>, <<"urn:xmpp:ping">>}], children = []}, _) -> true;
reply_element(Element, Claims) -> jingle(Element, Claims, in) orelse jingle(Element, Claims, out) orelse handoff(Element, Claims).
intent(#xmlel{name = Action, attrs = Attrs, children = Children}, Claims, Direction) ->
    true = maps:from_list(Attrs) =:= #{<<"xmlns">> => ?JMI, <<"id">> => maps:get(<<"sid">>, Claims)},
    case {Direction, Action} of
        {out, Value} when Value =:= <<"proceed">>; Value =:= <<"reject">>; Value =:= <<"finish">> -> Children =:= [];
        {in, Value} when Value =:= <<"retract">>; Value =:= <<"finish">> -> Children =:= [];
        {in, <<"propose">>} ->
            true = lists:all(fun(#xmlel{children = Value}) -> Value =:= [] end, Children),
            media_kinds(Children) =:= profile(Claims);
        _ -> false
    end.
metadata(#xmlel{name = <<"store">>, attrs = [{<<"xmlns">>, <<"urn:xmpp:hints">>}], children = []}, _, _) -> true;
metadata(#xmlel{name = Name, attrs = Attrs, children = []}, Claims, in) ->
    maps:get(<<"owner">>, Claims) =:= proplists:get_value(<<"by">>, Attrs) andalso
        ((Name =:= <<"archived">> andalso proplists:get_value(<<"xmlns">>, Attrs) =:= <<"urn:xmpp:mam:tmp">>) orelse
         (Name =:= <<"stanza-id">> andalso proplists:get_value(<<"xmlns">>, Attrs) =:= <<"urn:xmpp:sid:0">>));
metadata(_, _, _) -> false.

profile(Claims) ->
    case maps:get(<<"profile">>, Claims) of <<"audio">> -> [audio]; <<"video">> -> [audio, video]; <<"audio-rtt">> -> [audio, rtt]; <<"total">> -> [audio, rtt, video] end.
media_kinds(Elements) ->
    lists:sort([case Element of
        #xmlel{name = <<"description">>, attrs = Attrs} ->
            case proplists:get_value(<<"xmlns">>, Attrs) of
                <<"urn:xmpp:jingle:apps:rtt-sync:0">> -> rtt;
                <<"urn:xmpp:jingle:apps:rtp:1">> -> case proplists:get_value(<<"media">>, Attrs) of <<"audio">> -> audio; <<"video">> -> video end
            end
    end || Element <- Elements]).

revoke_device(Host, Device, Generation) ->
    {atomic, Processes} = mnesia:transaction(fun() ->
        mnesia:write_lock_table(?TABLE),
        Records = mnesia:match_object({?TABLE, {Host, '_'}, '_', Device, Generation, '_'}),
        Now = erlang:system_time(second),
        lists:foreach(fun({?TABLE, Id, _, _, _, _}) ->
            mnesia:write({?TABLE, Id, revoked, Device, Generation, Now}) end, Records),
        mnesia:write({?TABLE, {Host, {revoked, Device, Generation}}, revoked, Device, Generation, Now + 20}),
        [Pid || {?TABLE, _, Pid, _, _, _} <- Records, is_pid(Pid)]
    end),
    lists:foreach(fun ejabberd_c2s:stop_async/1, Processes), ok.
