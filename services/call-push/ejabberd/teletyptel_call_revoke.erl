-module(teletyptel_call_revoke).
-include_lib("ejabberd/include/ejabberd_http.hrl").
-export([process/2]).

process([], #request{method = 'POST', sockmod = fast_tls, tp = https, data = Data}) when byte_size(Data) =< 2048 ->
    try
        Envelope = jiffy:decode(Data, [return_maps]),
        true = lists:sort(maps:keys(Envelope)) =:= [<<"payload">>, <<"signature">>],
        Event = ejabberd_auth_teletyptel_calls:signed_revocation(maps:get(<<"payload">>, Envelope), maps:get(<<"signature">>, Envelope)),
        {200, headers(), jiffy:encode(#{revoked => true, eventId => Event})}
    catch _:_ -> {403, headers(), <<"{\"revoked\":false}">>} end;
process(_, _) -> {403, headers(), <<"{\"revoked\":false}">>}.

headers() -> [{<<"Content-Type">>, <<"application/json">>}, {<<"Cache-Control">>, <<"no-store">>}].
