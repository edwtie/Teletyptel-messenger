-module(teletyptel_call_ws).
-include_lib("ejabberd/include/ejabberd_http.hrl").
-export([socket_handoff/3]).

socket_handoff(Path, #request{sockmod = fast_tls, tp = https, ip = IP, headers = Headers} = Request, Options) ->
    try
        Attestation = ejabberd_auth_teletyptel_calls:attest_websocket(IP),
        Clean = [{Name, Value} || {Name, Value} <- Headers,
            string:lowercase(iolist_to_binary(case is_atom(Name) of true -> atom_to_list(Name); false -> Name end)) =/= <<"x-teletyptel-tls-attestation">>],
        ejabberd_http_ws:socket_handoff(Path, Request#request{headers = [{<<"x-teletyptel-tls-attestation">>, Attestation} | Clean]}, Options)
    catch _:_ -> {503, [{<<"Content-Type">>, <<"text/plain">>}], <<"Call transport unavailable">>} end;
socket_handoff(_, _, _) -> {403, [{<<"Content-Type">>, <<"text/plain">>}], <<"TLS required">>}.
