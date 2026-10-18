"use strict";var Ye=Object.create;var ue=Object.defineProperty;var Je=Object.getOwnPropertyDescriptor;var Xe=Object.getOwnPropertyNames;var Ze=Object.getPrototypeOf,et=Object.prototype.hasOwnProperty;var he=(e,o)=>()=>(o||e((o={exports:{}}).exports,o),o.exports);var tt=(e,o,t,r)=>{if(o&&typeof o=="object"||typeof o=="function")for(let i of Xe(o))!et.call(e,i)&&i!==t&&ue(e,i,{get:()=>o[i],enumerable:!(r=Je(o,i))||r.enumerable});return e};var S=(e,o,t)=>(t=e!=null?Ye(Ze(e)):{},tt(o||!e||!e.__esModule?ue(t,"default",{value:e,enumerable:!0}):t,e));var Ee=he((oo,we)=>{"use strict";var z=Symbol("arg flag"),f=class e extends Error{constructor(o,t){super(o),this.name="ArgError",this.code=t,Object.setPrototypeOf(this,e.prototype)}};function D(e,{argv:o=process.argv.slice(2),permissive:t=!1,stopAtPositional:r=!1}={}){if(!e)throw new f("argument specification object is required","ARG_CONFIG_NO_SPEC");let i={_:[]},n={},m={};for(let s of Object.keys(e)){if(!s)throw new f("argument key cannot be an empty string","ARG_CONFIG_EMPTY_KEY");if(s[0]!=="-")throw new f(`argument key must start with '-' but found: '${s}'`,"ARG_CONFIG_NONOPT_KEY");if(s.length===1)throw new f(`argument key must have a name; singular '-' keys are not allowed: ${s}`,"ARG_CONFIG_NONAME_KEY");if(typeof e[s]=="string"){n[s]=e[s];continue}let d=e[s],h=!1;if(Array.isArray(d)&&d.length===1&&typeof d[0]=="function"){let[$]=d;d=(_,v,C=[])=>(C.push($(_,v,C[C.length-1])),C),h=$===Boolean||$[z]===!0}else if(typeof d=="function")h=d===Boolean||d[z]===!0;else throw new f(`type missing or not a function or valid array type: ${s}`,"ARG_CONFIG_VAD_TYPE");if(s[1]!=="-"&&s.length>2)throw new f(`short argument keys (with a single hyphen) must have only one character: ${s}`,"ARG_CONFIG_SHORTOPT_TOOLONG");m[s]=[d,h]}for(let s=0,d=o.length;s<d;s++){let h=o[s];if(r&&i._.length>0){i._=i._.concat(o.slice(s));break}if(h==="--"){i._=i._.concat(o.slice(s+1));break}if(h.length>1&&h[0]==="-"){let $=h[1]==="-"||h.length===2?[h]:h.slice(1).split("").map(_=>`-${_}`);for(let _=0;_<$.length;_++){let v=$[_],[C,ce]=v[1]==="-"?v.split(/=(.*)/,2):[v,void 0],u=C;for(;u in n;)u=n[u];if(!(u in m))if(t){i._.push(v);continue}else throw new f(`unknown or unexpected option: ${C}`,"ARG_UNKNOWN_OPTION");let[y,de]=m[u];if(!de&&_+1<$.length)throw new f(`option requires argument (but was followed by another short argument): ${C}`,"ARG_MISSING_REQUIRED_SHORTARG");if(de)i[u]=y(!0,u,i[u]);else if(ce===void 0){if(o.length<s+2||o[s+1].length>1&&o[s+1][0]==="-"&&!(o[s+1].match(/^-?\d*(\.(?=\d))?\d*$/)&&(y===Number||typeof BigInt<"u"&&y===BigInt))){let ze=C===u?"":` (alias for ${u})`;throw new f(`option requires argument: ${C}${ze}`,"ARG_MISSING_REQUIRED_LONGARG")}i[u]=y(o[s+1],u,i[u]),++s}else i[u]=y(ce,u,i[u])}}else i._.push(h)}return i}D.flag=e=>(e[z]=!0,e);D.COUNT=D.flag((e,o,t)=>(t||0)+1);D.ArgError=f;we.exports=D});var ke=he((io,Oe)=>{"use strict";Oe.exports=e=>{let o=e.match(/^[ \t]*(?=\S)/gm);return o?o.reduce((t,r)=>Math.min(t,r.length),1/0):0}});var fe=S(require("node:path"));function ge(e=process.argv[1]){let o=e?.replaceAll("\\","/");return(o===void 0?void 0:fe.default.posix.parse(o).name)==="prisma7"?"prisma7":"prisma"}function Ce(e,o){return`#compdef ${e}
compdef _${e} ${e}

# zsh completion for ${e} -*- shell-script -*-

__${e}_debug() {
    local file="$BASH_COMP_DEBUG_FILE"
    if [[ -n \${file} ]]; then
        echo "$*" >> "\${file}"
    fi
}

_${e}() {
    local shellCompDirectiveError=${p.ShellCompDirectiveError}
    local shellCompDirectiveNoSpace=${p.ShellCompDirectiveNoSpace}
    local shellCompDirectiveNoFileComp=${p.ShellCompDirectiveNoFileComp}
    local shellCompDirectiveFilterFileExt=${p.ShellCompDirectiveFilterFileExt}
    local shellCompDirectiveFilterDirs=${p.ShellCompDirectiveFilterDirs}
    local shellCompDirectiveKeepOrder=${p.ShellCompDirectiveKeepOrder}

    local lastParam lastChar flagPrefix requestComp out directive comp lastComp noSpace keepOrder
    local -a completions

    __${e}_debug "\\n========= starting completion logic =========="
    __${e}_debug "CURRENT: \${CURRENT}, words[*]: \${words[*]}"

    # The user could have moved the cursor backwards on the command-line.
    # We need to trigger completion from the $CURRENT location, so we need
    # to truncate the command-line ($words) up to the $CURRENT location.
    # (We cannot use $CURSOR as its value does not work when a command is an alias.)
    words=( "\${=words[1,CURRENT]}" )
    __${e}_debug "Truncated words[*]: \${words[*]},"

    lastParam=\${words[-1]}
    lastChar=\${lastParam[-1]}
    __${e}_debug "lastParam: \${lastParam}, lastChar: \${lastChar}"

    # For zsh, when completing a flag with an = (e.g., ${e} -n=<TAB>)
    # completions must be prefixed with the flag
    setopt local_options BASH_REMATCH
    if [[ "\${lastParam}" =~ '-.*=' ]]; then
        # We are dealing with a flag with an =
        flagPrefix="-P \${BASH_REMATCH}"
    fi

    # Prepare the command to obtain completions, ensuring arguments are quoted for eval
    local -a args_to_quote=("\${(@)words[2,-1]}")
    if [ "\${lastChar}" = "" ] && [ "\${args_to_quote[-1]}" != "" ]; then
        # If the last parameter is complete (there is a space following it)
        # We add an extra empty parameter so we can indicate this to the go completion code.
        __${e}_debug "Adding extra empty parameter"
        args_to_quote+=("")
    fi

    # Use Zsh's (q) flag to quote each argument safely for eval
    local quoted_args=("\${(@q)args_to_quote}")

    # Join the main command and the quoted arguments into a single string for eval
    requestComp="${o} complete -- \${quoted_args[*]}"

    __${e}_debug "About to call: eval \${requestComp}"

    # Use eval to handle any environment variables and such
    out=$(eval \${requestComp} 2>/dev/null)
    __${e}_debug "completion output: \${out}"

    # Extract the directive integer following a : from the last line
    local lastLine
    while IFS='
' read -r line; do
        lastLine=\${line}
    done < <(printf "%s
" "\${out[@]}")
    __${e}_debug "last line: \${lastLine}"

    if [ "\${lastLine[1]}" = : ]; then
        directive=\${lastLine[2,-1]}
        # Remove the directive including the : and the newline
        local suffix
        (( suffix=\${#lastLine}+2))
        out=\${out[1,-$suffix]}
    else
        # There is no directive specified.  Leave $out as is.
        __${e}_debug "No directive found.  Setting to default"
        directive=0
    fi

    __${e}_debug "directive: \${directive}"
    __${e}_debug "completions: \${out}"
    __${e}_debug "flagPrefix: \${flagPrefix}"

    if [ $((directive & shellCompDirectiveError)) -ne 0 ]; then
        __${e}_debug "Completion received error. Ignoring completions."
        return
    fi

    local activeHelpMarker="%"
    local endIndex=\${#activeHelpMarker}
    local startIndex=$((\${#activeHelpMarker}+1))
    local hasActiveHelp=0
    while IFS='
' read -r comp; do
        # Check if this is an activeHelp statement (i.e., prefixed with $activeHelpMarker)
        if [ "\${comp[1,$endIndex]}" = "$activeHelpMarker" ];then
            __${e}_debug "ActiveHelp found: $comp"
            comp="\${comp[$startIndex,-1]}"
            if [ -n "$comp" ]; then
                compadd -x "\${comp}"
                __${e}_debug "ActiveHelp will need delimiter"
                hasActiveHelp=1
            fi
            continue
        fi

        if [ -n "$comp" ]; then
            # If requested, completions are returned with a description.
            # The description is preceded by a TAB character.
            # For zsh's _describe, we need to use a : instead of a TAB.
            # We first need to escape any : as part of the completion itself.
            comp=\${comp//:/\\:}

            local tab="$(printf '\\t')"
            comp=\${comp//$tab/:}

            __${e}_debug "Adding completion: \${comp}"
            completions+=\${comp}
            lastComp=$comp
        fi
    done < <(printf "%s
" "\${out[@]}")

    # Add a delimiter after the activeHelp statements, but only if:
    # - there are completions following the activeHelp statements, or
    # - file completion will be performed (so there will be choices after the activeHelp)
    if [ $hasActiveHelp -eq 1 ]; then
        if [ \${#completions} -ne 0 ] || [ $((directive & shellCompDirectiveNoFileComp)) -eq 0 ]; then
            __${e}_debug "Adding activeHelp delimiter"
            compadd -x "--"
            hasActiveHelp=0
        fi
    fi

    if [ $((directive & shellCompDirectiveNoSpace)) -ne 0 ]; then
        __${e}_debug "Activating nospace."
        noSpace="-S ''"
    fi

    if [ $((directive & shellCompDirectiveKeepOrder)) -ne 0 ]; then
        __${e}_debug "Activating keep order."
        keepOrder="-V"
    fi

    if [ $((directive & shellCompDirectiveFilterFileExt)) -ne 0 ]; then
        # File extension filtering
        local filteringCmd
        filteringCmd='_files'
        for filter in \${completions[@]}; do
            if [ \${filter[1]} != '*' ]; then
                # zsh requires a glob pattern to do file filtering
                filter="\\*.$filter"
            fi
            filteringCmd+=" -g $filter"
        done
        filteringCmd+=" \${flagPrefix}"

        __${e}_debug "File filtering command: $filteringCmd"
        _arguments '*:filename:'"$filteringCmd"
    elif [ $((directive & shellCompDirectiveFilterDirs)) -ne 0 ]; then
        # File completion for directories only
        local subdir
        subdir="\${completions[1]}"
        if [ -n "$subdir" ]; then
            __${e}_debug "Listing directories in $subdir"
            pushd "\${subdir}" >/dev/null 2>&1
        else
            __${e}_debug "Listing directories in ."
        fi

        local result
        _arguments '*:dirname:_files -/'" \${flagPrefix}"
        result=$?
        if [ -n "$subdir" ]; then
            popd >/dev/null 2>&1
        fi
        return $result
    else
        __${e}_debug "Calling _describe"
        if eval _describe $keepOrder "completions" completions -Q \${flagPrefix} \${noSpace}; then
            __${e}_debug "_describe found some completions"

            # Return the success of having called _describe
            return 0
        else
            __${e}_debug "_describe did not find completions."
            __${e}_debug "Checking if we should do file completion."
            if [ $((directive & shellCompDirectiveNoFileComp)) -ne 0 ]; then
                __${e}_debug "deactivating file completion"

                # Return 0 to indicate completion is finished and prevent zsh from
                # trying other completion algorithms (which could cause hanging).
                # We use NoFileComp directive to explicitly disable file completion.
                return 0
            else
                # Perform file completion
                __${e}_debug "Activating file completion"

                # We must return the result of this command, so it must be the
                # last command, or else we must store its result to return it.
                _arguments '*:filename:_files'" \${flagPrefix}"
            fi
        fi
    fi
}

# don't run the completion function when being sourced or eval-ed
if [ "\${funcstack[1]}" = "_${e}" ]; then
    _${e}
fi
`}function _e(e,o){let t=e.replace(/[-:]/g,"_");return`# bash completion for ${e}

# Define shell completion directives
readonly ShellCompDirectiveError=${p.ShellCompDirectiveError}
readonly ShellCompDirectiveNoSpace=${p.ShellCompDirectiveNoSpace}
readonly ShellCompDirectiveNoFileComp=${p.ShellCompDirectiveNoFileComp}
readonly ShellCompDirectiveFilterFileExt=${p.ShellCompDirectiveFilterFileExt}
readonly ShellCompDirectiveFilterDirs=${p.ShellCompDirectiveFilterDirs}
readonly ShellCompDirectiveKeepOrder=${p.ShellCompDirectiveKeepOrder}

# Function to debug completion
__${t}_debug() {
    if [[ -n \${BASH_COMP_DEBUG_FILE:-} ]]; then
        echo "$*" >> "\${BASH_COMP_DEBUG_FILE}"
    fi
}

# Function to handle completions
__${t}_complete() {
    local cur prev words cword
    _get_comp_words_by_ref -n "=:" cur prev words cword

    local requestComp out directive
    
    # Build the command to get completions
    requestComp="${o} complete -- \${words[@]:1}"
    
    # Add an empty parameter if the last parameter is complete
    if [[ -z "$cur" ]]; then
        requestComp="$requestComp ''"
    fi
    
    # Get completions from the program
    out=$(eval "$requestComp" 2>/dev/null)
    
    # Extract directive if present
    directive=0
    if [[ "$out" == *:* ]]; then
        directive=\${out##*:}
        out=\${out%:*}
    fi
    
    # Process completions based on directive
    if [[ $((directive & $ShellCompDirectiveError)) -ne 0 ]]; then
        # Error, no completion
        return
    fi
    
    # Apply directives
    if [[ $((directive & $ShellCompDirectiveNoSpace)) -ne 0 ]]; then
        compopt -o nospace
    fi
    if [[ $((directive & $ShellCompDirectiveKeepOrder)) -ne 0 ]]; then
        compopt -o nosort
    fi
    if [[ $((directive & $ShellCompDirectiveNoFileComp)) -ne 0 ]]; then
        compopt +o default
    fi
    
    # Handle file extension filtering
    if [[ $((directive & $ShellCompDirectiveFilterFileExt)) -ne 0 ]]; then
        local filter=""
        for ext in $out; do
            filter="$filter|$ext"
        done
        filter="\\.($filter)"
        compopt -o filenames
        COMPREPLY=( $(compgen -f -X "!$filter" -- "$cur") )
        return
    fi
    
    # Handle directory filtering
    if [[ $((directive & $ShellCompDirectiveFilterDirs)) -ne 0 ]]; then
        compopt -o dirnames
        COMPREPLY=( $(compgen -d -- "$cur") )
        return
    fi
    
    # Process completions
    local IFS=$'\\n'
    local tab=$(printf '\\t')
    
    # Parse completions with descriptions
    local completions=()
    while read -r comp; do
        if [[ "$comp" == *$tab* ]]; then
            # Split completion and description
            local value=\${comp%%$tab*}
            local desc=\${comp#*$tab}
            completions+=("$value")
        else
            completions+=("$comp")
        fi
    done <<< "$out"
    
    # Return completions
    COMPREPLY=( $(compgen -W "\${completions[*]}" -- "$cur") )
}

# Register completion function
complete -F __${t}_complete ${e}
`}function $e(e,o){let t=e.replace(/[-:]/g,"_"),r=p.ShellCompDirectiveError,i=p.ShellCompDirectiveNoSpace,n=p.ShellCompDirectiveNoFileComp,m=p.ShellCompDirectiveFilterFileExt,s=p.ShellCompDirectiveFilterDirs;return`# fish completion for ${e} -*- shell-script -*-

function __${t}_debug
    set -l file "$BASH_COMP_DEBUG_FILE"
    if test -n "$file"
        echo "$argv" >> $file
    end
end

function __${t}_perform_completion
    __${t}_debug "Starting __${t}_perform_completion"

    # Extract all args except the last one
    set -l args (commandline -opc)
    # Extract the token currently being completed (may be empty on a trailing space)
    set -l lastArg (commandline -ct)

    __${t}_debug "args: $args"
    __${t}_debug "last arg: $lastArg"

    # Pass each arg as its own token (no string join/eval, which would collapse multi-segment paths); quote "$lastArg" so an empty trailing token is still sent.
    __${t}_debug "Calling ${o} complete -- $args[2..-1] $lastArg"
    set -l results (${o} complete -- $args[2..-1] "$lastArg" 2> /dev/null)

    # Some programs may output extra empty lines after the directive.
    # Let's ignore them or else it will break completion.
    # Ref: https://github.com/spf13/cobra/issues/1279
    for line in $results[-1..1]
        if test (string trim -- $line) = ""
            # Found an empty line, remove it
            set results $results[1..-2]
        else
            # Found non-empty line, we have our proper output
            break
        end
    end

    set -l comps $results[1..-2]
    set -l directiveLine $results[-1]

    # For Fish, when completing a flag with an = (e.g., <program> -n=<TAB>)
    # completions must be prefixed with the flag
    set -l flagPrefix (string match -r -- '-.*=' "$lastArg")

    __${t}_debug "Comps: $comps"
    __${t}_debug "DirectiveLine: $directiveLine"
    __${t}_debug "flagPrefix: $flagPrefix"

    for comp in $comps
        printf "%s%s\\n" "$flagPrefix" "$comp"
    end

    printf "%s\\n" "$directiveLine"
end

# This function limits calls to __${t}_perform_completion, by caching the result
function __${t}_perform_completion_once
    __${t}_debug "Starting __${t}_perform_completion_once"

    if test -n "$__${t}_perform_completion_once_result"
        __${t}_debug "Seems like a valid result already exists, skipping __${t}_perform_completion"
        return 0
    end

    set --global __${t}_perform_completion_once_result (__${t}_perform_completion)
    if test -z "$__${t}_perform_completion_once_result"
        __${t}_debug "No completions, probably due to a failure"
        return 1
    end

    __${t}_debug "Performed completions and set __${t}_perform_completion_once_result"
    return 0
end

# This function is used to clear the cached result after completions are run
function __${t}_clear_perform_completion_once_result
    __${t}_debug ""
    __${t}_debug "========= clearing previously set __${t}_perform_completion_once_result variable =========="
    set --erase __${t}_perform_completion_once_result
    __${t}_debug "Successfully erased the variable __${t}_perform_completion_once_result"
end

function __${t}_requires_order_preservation
    __${t}_debug ""
    __${t}_debug "========= checking if order preservation is required =========="

    __${t}_perform_completion_once
    if test -z "$__${t}_perform_completion_once_result"
        __${t}_debug "Error determining if order preservation is required"
        return 1
    end

    set -l directive (string sub --start 2 $__${t}_perform_completion_once_result[-1])
    __${t}_debug "Directive is: $directive"

    set -l shellCompDirectiveKeepOrder ${p.ShellCompDirectiveKeepOrder}
    set -l keeporder (math (math --scale 0 $directive / $shellCompDirectiveKeepOrder) % 2)
    __${t}_debug "Keeporder is: $keeporder"

    if test $keeporder -ne 0
        __${t}_debug "This does require order preservation"
        return 0
    end

    __${t}_debug "This doesn't require order preservation"
    return 1
end

# This function does two things:
# - Obtain the completions and store them in the global __${t}_comp_results
# - Return false if file completion should be performed
function __${t}_prepare_completions
    __${t}_debug ""
    __${t}_debug "========= starting completion logic =========="

    # Start fresh
    set --erase __${t}_comp_results

    __${t}_perform_completion_once
    __${t}_debug "Completion results: $__${t}_perform_completion_once_result"

    if test -z "$__${t}_perform_completion_once_result"
        __${t}_debug "No completion, probably due to a failure"
        # Might as well do file completion, in case it helps
        return 1
    end

    set -l directive (string sub --start 2 $__${t}_perform_completion_once_result[-1])
    set --global __${t}_comp_results $__${t}_perform_completion_once_result[1..-2]

    __${t}_debug "Completions are: $__${t}_comp_results"
    __${t}_debug "Directive is: $directive"

    set -l shellCompDirectiveError ${r}
    set -l shellCompDirectiveNoSpace ${i}
    set -l shellCompDirectiveNoFileComp ${n}
    set -l shellCompDirectiveFilterFileExt ${m}
    set -l shellCompDirectiveFilterDirs ${s}

    if test -z "$directive"
        set directive 0
    end

    set -l compErr (math (math --scale 0 $directive / $shellCompDirectiveError) % 2)
    if test $compErr -eq 1
        __${t}_debug "Received error directive: aborting."
        # Might as well do file completion, in case it helps
        return 1
    end

    set -l filefilter (math (math --scale 0 $directive / $shellCompDirectiveFilterFileExt) % 2)
    set -l dirfilter (math (math --scale 0 $directive / $shellCompDirectiveFilterDirs) % 2)
    if test $filefilter -eq 1; or test $dirfilter -eq 1
        __${t}_debug "File extension filtering or directory filtering not supported"
        # Do full file completion instead
        return 1
    end

    set -l nospace (math (math --scale 0 $directive / $shellCompDirectiveNoSpace) % 2)
    set -l nofiles (math (math --scale 0 $directive / $shellCompDirectiveNoFileComp) % 2)

    __${t}_debug "nospace: $nospace, nofiles: $nofiles"

    # If we want to prevent a space, or if file completion is NOT disabled,
    # we need to count the number of valid completions.
    # To do so, we will filter on prefix as the completions we have received
    # may not already be filtered so as to allow fish to match on different
    # criteria than the prefix.
    if test $nospace -ne 0; or test $nofiles -eq 0
        set -l prefix (commandline -t | string escape --style=regex)
        __${t}_debug "prefix: $prefix"

        set -l completions (string match -r -- "^$prefix.*" $__${t}_comp_results)
        set --global __${t}_comp_results $completions
        __${t}_debug "Filtered completions are: $__${t}_comp_results"

        # Important not to quote the variable for count to work
        set -l numComps (count $__${t}_comp_results)
        __${t}_debug "numComps: $numComps"

        if test $numComps -eq 1; and test $nospace -ne 0
            # We must first split on \\t to get rid of the descriptions to be
            # able to check what the actual completion will be.
            # We don't need descriptions anyway since there is only a single
            # real completion which the shell will expand immediately.
            set -l split (string split --max 1 "\\t" $__${t}_comp_results[1])

            # Fish won't add a space if the completion ends with any
            # of the following characters: @=/:.,
            set -l lastChar (string sub -s -1 -- $split)
            if not string match -r -q "[@=/:.,]" -- "$lastChar"
                # In other cases, to support the "nospace" directive we trick the shell
                # by outputting an extra, longer completion.
                __${t}_debug "Adding second completion to perform nospace directive"
                set --global __${t}_comp_results $split[1] $split[1].
                __${t}_debug "Completions are now: $__${t}_comp_results"
            end
        end

        if test $numComps -eq 0; and test $nofiles -eq 0
            # To be consistent with bash and zsh, we only trigger file
            # completion when there are no other completions
            __${t}_debug "Requesting file completion"
            return 1
        end
    end

    return 0
end

# Since Fish completions are only loaded once the user triggers them, we trigger them ourselves
# so we can properly delete any completions provided by another script.
# Only do this if the program can be found, or else fish may print some errors; besides,
# the existing completions will only be loaded if the program can be found.
if type -q "${e}"
    # The space after the program name is essential to trigger completion for the program
    # and not completion of the program name itself.
    # Also, we use '> /dev/null 2>&1' since '&>' is not supported in older versions of fish.
    complete --do-complete "${e} " > /dev/null 2>&1
end

# Remove any pre-existing completions for the program since we will be handling all of them.
complete -c ${e} -e

# This will get called after the two calls below and clear the cached result
complete -c ${e} -n '__${t}_clear_perform_completion_once_result'
# The call to __${t}_prepare_completions will setup __${t}_comp_results
# which provides the program's completion choices.
# If this doesn't require order preservation, we don't use the -k flag
complete -c ${e} -n 'not __${t}_requires_order_preservation && __${t}_prepare_completions' -f -a '$__${t}_comp_results'
# Otherwise we use the -k flag
complete -k -c ${e} -n '__${t}_requires_order_preservation && __${t}_prepare_completions' -f -a '$__${t}_comp_results'
`}function ve(e,o){let t=e.replace(/[-:]/g,"_");return`# powershell completion for ${e} -*- shell-script -*-

  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    function __${e}_debug {
        if ($env:BASH_COMP_DEBUG_FILE) {
            "$args" | Out-File -Append -FilePath "$env:BASH_COMP_DEBUG_FILE"
        }
    }

    filter __${e}_escapeStringWithSpecialChars {
        $_ -replace '\\s|#|@|\\$|;|,|''|\\{|\\}|\\(|\\)|"|\\||<|>|&','\`$&'
    }

[scriptblock]$__${t}CompleterBlock = {
    param(
            $WordToComplete,
            $CommandAst,
            $CursorPosition
        )

    # Get the current command line and convert into a string
    $Command = $CommandAst.CommandElements
    $Command = "$Command"

    __${e}_debug ""
    __${e}_debug "========= starting completion logic =========="
    __${e}_debug "WordToComplete: $WordToComplete Command: $Command CursorPosition: $CursorPosition"

    # The user could have moved the cursor backwards on the command-line.
    # We need to trigger completion from the $CursorPosition location, so we need
    # to truncate the command-line ($Command) up to the $CursorPosition location.
    # Make sure the $Command is longer then the $CursorPosition before we truncate.
    # This happens because the $Command does not include the last space.
    if ($Command.Length -gt $CursorPosition) {
        $Command = $Command.Substring(0, $CursorPosition)
    }
    __${e}_debug "Truncated command: $Command"

    $ShellCompDirectiveError=${p.ShellCompDirectiveError}
    $ShellCompDirectiveNoSpace=${p.ShellCompDirectiveNoSpace}
    $ShellCompDirectiveNoFileComp=${p.ShellCompDirectiveNoFileComp}
    $ShellCompDirectiveFilterFileExt=${p.ShellCompDirectiveFilterFileExt}
    $ShellCompDirectiveFilterDirs=${p.ShellCompDirectiveFilterDirs}
    $ShellCompDirectiveKeepOrder=${p.ShellCompDirectiveKeepOrder}

    # Prepare the command to request completions for the program.
    # Split the command at the first space to separate the program and arguments.
    $Program, $Arguments = $Command.Split(" ", 2)

    $QuotedArgs = ($Arguments -split ' ' | ForEach-Object { "'" + ($_ -replace "'", "''") + "'" }) -join ' '
    __${e}_debug "QuotedArgs: $QuotedArgs"

    $RequestComp = "& ${o} complete '--' $QuotedArgs"
    __${e}_debug "RequestComp: $RequestComp"

    # we cannot use $WordToComplete because it
    # has the wrong values if the cursor was moved
    # so use the last argument
    if ($WordToComplete -ne "" ) {
        $WordToComplete = $Arguments.Split(" ")[-1]
    }
    __${e}_debug "New WordToComplete: $WordToComplete"


    # Check for flag with equal sign
    $IsEqualFlag = ($WordToComplete -Like "--*=*" )
    if ( $IsEqualFlag ) {
        __${e}_debug "Completing equal sign flag"
        # Remove the flag part
        $Flag, $WordToComplete = $WordToComplete.Split("=", 2)
    }
    $HasTrailingEmptyArg = $QuotedArgs -match "(^| )''$"
    __${e}_debug "HasTrailingEmptyArg: $HasTrailingEmptyArg"
    
    if ( $WordToComplete -eq "" -And ( -Not $IsEqualFlag ) -And ( -Not $HasTrailingEmptyArg )) {
        # If the last parameter is complete (there is a space following it)
        # We add an extra empty parameter so we can indicate this to the go method.
        __${e}_debug "Adding extra empty parameter"
        # PowerShell 7.2+ changed the way how the arguments are passed to executables,
        # so for pre-7.2 or when Legacy argument passing is enabled we need to use
        if ($PSVersionTable.PsVersion -lt [version]'7.2.0' -or
            ($PSVersionTable.PsVersion -lt [version]'7.3.0' -and -not [ExperimentalFeature]::IsEnabled("PSNativeCommandArgumentPassing")) -or
            (($PSVersionTable.PsVersion -ge [version]'7.3.0' -or [ExperimentalFeature]::IsEnabled("PSNativeCommandArgumentPassing")) -and
              $PSNativeCommandArgumentPassing -eq 'Legacy')) {
             $RequestComp="$RequestComp" + ' \`"\`"'
        } else {
             $RequestComp = "$RequestComp" + ' ""'
        }
    }

    __${e}_debug "Calling $RequestComp"
    # First disable ActiveHelp which is not supported for Powershell
    $env:ActiveHelp = 0

    # call the command store the output in $out and redirect stderr and stdout to null
    # $Out is an array contains each line per element
    Invoke-Expression -OutVariable out "$RequestComp" 2>&1 | Out-Null

    # get directive from last line
    [int]$Directive = $Out[-1].TrimStart(':')
    if ($Directive -eq "") {
        # There is no directive specified
        $Directive = 0
    }
    __${e}_debug "The completion directive is: $Directive"

    # remove directive (last element) from out
    $Out = $Out | Where-Object { $_ -ne $Out[-1] }
    __${e}_debug "The completions are: $Out"

    if (($Directive -band $ShellCompDirectiveError) -ne 0 ) {
        # Error code.  No completion.
        __${e}_debug "Received error from custom completion go code"
        return
    }

    $Longest = 0
    [Array]$Values = $Out | ForEach-Object {
        # Split the output in name and description
        $Name, $Description = $_.Split("\`t", 2)
        __${e}_debug "Name: $Name Description: $Description"

        # Look for the longest completion so that we can format things nicely
        if ($Longest -lt $Name.Length) {
            $Longest = $Name.Length
        }

        # Set the description to a one space string if there is none set.
        # This is needed because the CompletionResult does not accept an empty string as argument
        if (-Not $Description) {
            $Description = " "
        }
        @{ Name = "$Name"; Description = "$Description" }
    }


    $Space = " "
    if (($Directive -band $ShellCompDirectiveNoSpace) -ne 0 ) {
        # remove the space here
        __${e}_debug "ShellCompDirectiveNoSpace is called"
        $Space = ""
    }

    if ((($Directive -band $ShellCompDirectiveFilterFileExt) -ne 0 ) -or
       (($Directive -band $ShellCompDirectiveFilterDirs) -ne 0 ))  {
        __${e}_debug "ShellCompDirectiveFilterFileExt ShellCompDirectiveFilterDirs are not supported"

        # return here to prevent the completion of the extensions
        return
    }

    $Values = $Values | Where-Object {
        # filter the result
        $_.Name -like "$WordToComplete*"

        # Join the flag back if we have an equal sign flag
        if ( $IsEqualFlag ) {
            __${e}_debug "Join the equal sign flag back to the completion value"
            $_.Name = $Flag + "=" + $_.Name
        }
    }

    # we sort the values in ascending order by name if keep order isn't passed
    if (($Directive -band $ShellCompDirectiveKeepOrder) -eq 0 ) {
        $Values = $Values | Sort-Object -Property Name
    }

    if (($Directive -band $ShellCompDirectiveNoFileComp) -ne 0 ) {
        __${e}_debug "ShellCompDirectiveNoFileComp is called"

        if ($Values.Length -eq 0) {
            # Just print an empty string here so the
            # shell does not start to complete paths.
            # We cannot use CompletionResult here because
            # it does not accept an empty string as argument.
            ""
            return
        }
    }

    # Get the current mode
    $Mode = (Get-PSReadLineKeyHandler | Where-Object { $_.Key -eq "Tab" }).Function
    __${e}_debug "Mode: $Mode"

    $Values | ForEach-Object {

        # store temporary because switch will overwrite $_
        $comp = $_

        # PowerShell supports three different completion modes
        # - TabCompleteNext (default windows style - on each key press the next option is displayed)
        # - Complete (works like bash)
        # - MenuComplete (works like zsh)
        # You set the mode with Set-PSReadLineKeyHandler -Key Tab -Function <mode>

        # CompletionResult Arguments:
        # 1) CompletionText text to be used as the auto completion result
        # 2) ListItemText   text to be displayed in the suggestion list
        # 3) ResultType     type of completion result
        # 4) ToolTip        text for the tooltip with details about the object

        switch ($Mode) {

            # bash like
            "Complete" {

                if ($Values.Length -eq 1) {
                    __${e}_debug "Only one completion left"

                    # insert space after value
                    [System.Management.Automation.CompletionResult]::new($($comp.Name | __${e}_escapeStringWithSpecialChars) + $Space, "$($comp.Name)", 'ParameterValue', "$($comp.Description)")

                } else {
                    # Add the proper number of spaces to align the descriptions
                    while($comp.Name.Length -lt $Longest) {
                        $comp.Name = $comp.Name + " "
                    }

                    # Check for empty description and only add parentheses if needed
                    if ($($comp.Description) -eq " " ) {
                        $Description = ""
                    } else {
                        $Description = "  ($($comp.Description))"
                    }

                    [System.Management.Automation.CompletionResult]::new("$($comp.Name)$Description", "$($comp.Name)$Description", 'ParameterValue', "$($comp.Description)")
                }
             }

            # zsh like
            "MenuComplete" {
                # insert space after value
                # MenuComplete will automatically show the ToolTip of
                # the highlighted value at the bottom of the suggestions.
                [System.Management.Automation.CompletionResult]::new($($comp.Name | __${e}_escapeStringWithSpecialChars) + $Space, "$($comp.Name)", 'ParameterValue', "$($comp.Description)")
            }

            # TabCompleteNext and in case we get something unknown
            Default {
                # Like MenuComplete but we don't want to add a space here because
                # the user need to press space anyway to get the completion.
                # Description will not be shown because that's not possible with TabCompleteNext
                [System.Management.Automation.CompletionResult]::new($($comp.Name | __${e}_escapeStringWithSpecialChars), "$($comp.Name)", 'ParameterValue', "$($comp.Description)")
            }
        }

    }
}

Register-ArgumentCompleter -CommandName '${e}' -ScriptBlock $__${t}CompleterBlock
`}var ye=S(require("node:assert"),1),p={ShellCompDirectiveError:1,ShellCompDirectiveNoSpace:2,ShellCompDirectiveNoFileComp:4,ShellCompDirectiveFilterFileExt:8,ShellCompDirectiveFilterDirs:16,ShellCompDirectiveKeepOrder:32,shellCompDirectiveMaxValue:64,ShellCompDirectiveDefault:0},ot=class{name;variadic;command;handler;constructor(e,o,t,r=!1){this.command=e,this.name=o,this.handler=t,this.variadic=r}},it=class{value;description;command;handler;alias;isBoolean;constructor(e,o,t,r,i,n){this.command=e,this.value=o,this.description=t,this.handler=r,this.alias=i,this.isBoolean=n}},be=class{value;description;options=new Map;arguments=new Map;parent;constructor(e,o){this.value=e,this.description=o}option(e,o,t,r){let i,n,m;typeof t=="function"?(i=t,n=r,m=!1):typeof t=="string"?(i=void 0,n=t,m=!0):(i=void 0,n=void 0,m=!0);let s=new it(this,e,o,i,n,m);return this.options.set(e,s),this}argument(e,o,t=!1){let r=new ot(this,e,o,t);return this.arguments.set(e,r),this}},rt=class extends be{commands=new Map;completions=[];directive=p.ShellCompDirectiveDefault;constructor(){super("","")}command(e,o){let t=new be(e,o);return this.commands.set(e,t),t}stripOptions(e){let o=[],t=0;for(;t<e.length;){let r=e[t];if(r.startsWith("-")){t++;let i=!1,n=this.findOption(this,r);if(n)i=n.isBoolean??!1;else for(let[,m]of this.commands){let s=this.findOption(m,r);if(s){i=s.isBoolean??!1;break}}!i&&t<e.length&&!e[t].startsWith("-")&&t++}else o.push(r),t++}return o}matchCommand(e){e=this.stripOptions(e);let o=[],t=[],r=null;for(let i=0;i<e.length;i++){let n=e[i];o.push(n);let m=this.commands.get(o.join(" "));if(m)r=m;else{t=e.slice(i,e.length);break}}return[r||this,t]}shouldCompleteFlags(e,o){if(o.startsWith("-"))return!0;if(e?.startsWith("-")){let t=this.findOption(this,e);if(!t){for(let[,r]of this.commands)if(t=this.findOption(r,e),t)break}return!(t&&t.isBoolean)}return!1}shouldCompleteCommands(e){return!e.startsWith("-")}handleFlagCompletion(e,o,t,r){let i;if(t.includes("=")){let[n]=t.split("=");i=n}else if(r?.startsWith("-")){let n=this.findOption(e,r);n&&!n.isBoolean&&(i=r)}if(i){let n=this.findOption(e,i);if(n?.handler){let m=[];n.handler.call(n,(s,d)=>m.push({value:s,description:d}),e.options),this.completions=m}return}if(t.startsWith("-")){let n=t.startsWith("-")&&!t.startsWith("--"),m=t.replace(/^-+/,"");for(let[s,d]of e.options)n&&d.alias&&`-${d.alias}`.startsWith(t)?this.completions.push({value:`-${d.alias}`,description:d.description}):!n&&s.startsWith(m)&&this.completions.push({value:`--${s}`,description:d.description})}}findOption(e,o){let t=e.options.get(o);if(t||(t=e.options.get(o.replace(/^-+/,"")),t))return t;for(let[r,i]of e.options)if(i.alias&&`-${i.alias}`===o)return i}handleCommandCompletion(e,o){let t=this.stripOptions(e);for(let[r,i]of this.commands){if(r==="")continue;let n=r.split(" ");n.slice(0,t.length).every((m,s)=>m===t[s])&&n[t.length]?.startsWith(o)&&this.completions.push({value:n[t.length],description:i.description})}}handlePositionalCompletion(e,o){let t=this.stripOptions(o),r=e.value.split(" ").length,i=Math.max(0,t.length-r),n=Array.from(e.arguments.entries());if(n.length>0){let m;if(i<n.length){let[s,d]=n[i];m=d}else{let s=n[n.length-1][1];s.variadic&&(m=s)}if(m&&m.handler&&typeof m.handler=="function"){let s=[];m.handler.call(m,(d,h)=>s.push({value:d,description:h}),e.options),this.completions.push(...s)}}}complete(e){this.directive=p.ShellCompDirectiveNoFileComp;let o=new Set;this.completions.filter(t=>o.has(t.value)?!1:(o.add(t.value),!0)).filter(t=>{if(e.includes("=")){let[,r]=e.split("=");return t.value.startsWith(r)}return t.value.startsWith(e)}).forEach(t=>console.log(`${t.value}	${t.description??""}`)),console.log(`:${this.directive}`)}parse(e){this.completions=[];let o=e[e.length-1]==="";o&&e.pop();let t=e[e.length-1]||"",r=e.slice(0,-1);o&&(t!==""&&r.push(t),t="");let[i]=this.matchCommand(r),n=r[r.length-1];this.shouldCompleteFlags(n,t)?this.handleFlagCompletion(i,r,t,n):(this.shouldCompleteCommands(t)&&this.handleCommandCompletion(r,t),i&&i.arguments.size>0&&this.handlePositionalCompletion(i,r)),this.complete(t)}setup(e,o,t){switch((0,ye.default)(t==="zsh"||t==="bash"||t==="fish"||t==="powershell","Unsupported shell"),t){case"zsh":{let r=Ce(e,o);console.log(r);break}case"bash":{let r=_e(e,o);console.log(r);break}case"fish":{let r=$e(e,o);console.log(r);break}case"powershell":{let r=ve(e,o);console.log(r);break}}}},w=new rt;var F,xe,Pe,De,Se=!0;typeof process<"u"&&({FORCE_COLOR:F,NODE_DISABLE_COLORS:xe,NO_COLOR:Pe,TERM:De}=process.env||{},Se=process.stdout&&process.stdout.isTTY);var nt={enabled:!xe&&Pe==null&&De!=="dumb"&&(F!=null&&F!=="0"||Se)};function c(e,o){let t=new RegExp(`\\x1b\\[${o}m`,"g"),r=`\x1B[${e}m`,i=`\x1B[${o}m`;return function(n){return!nt.enabled||n==null?n:r+(~(""+n).indexOf(i)?n.replace(t,i+r):n)+i}}var St=c(0,0),st=c(1,22),wt=c(2,22),Et=c(3,23),Ot=c(4,24),kt=c(7,27),Tt=c(8,28),Ft=c(9,29),Nt=c(30,39),at=c(31,39),At=c(32,39),Rt=c(33,39),It=c(34,39),qt=c(35,39),Lt=c(36,39),Mt=c(37,39),Wt=c(90,39),Gt=c(90,39),Ht=c(40,49),Vt=c(41,49),Bt=c(42,49),Ut=c(43,49),jt=c(44,49),Kt=c(45,49),Qt=c(46,49),zt=c(47,49);var l=[{value:"prisma/schema.prisma",description:"Default schema path"},{value:"./schema.prisma",description:"Schema in project root"}],a=[{value:"prisma7.config.ts",description:"Default config path"}],g=[{value:"postgresql://",description:"PostgreSQL connection string"},{value:"mysql://",description:"MySQL connection string"},{value:"file:",description:"SQLite connection string"},{value:"mongodb://",description:"MongoDB connection string"},{value:"sqlserver://",description:"SQL Server connection string"}],x=[{value:"<your-api-key>",description:"Workspace API key"}],P=[{value:"db_",description:"Database ID prefix (e.g. db_abc123)"}],N=[{value:"prisma-client",description:"Prisma Client generator"},{value:"prisma-client-js",description:"Legacy Prisma Client JS generator"}],A=[{value:"./generated/prisma",description:"Common client output path"},{value:"../generated/prisma",description:"Alternative client output path"}],R=[{value:"typedSql",description:"TypedSQL preview feature"}],I=[{value:"./script.sql",description:"SQL script file"}],E=[{value:"prisma/migrations",description:"Default migrations directory"},{value:"./migrations",description:"Custom migrations directory"}],q=[{value:"diff.sql",description:"SQL diff output file"}],L=[{value:"init",description:"Initial migration name"},{value:"add_users",description:"Example migration name"}],O=[{value:"20201231000000_add_users_table",description:"Example migration ID"}],M=[{value:"-1",description:"Infinite depth (default)"},{value:"0",description:"Off"},{value:"2",description:"Two levels deep"}],W=[{value:"public",description:"PostgreSQL default schema"}],G=[{value:"postgresql",description:"PostgreSQL"},{value:"mysql",description:"MySQL"},{value:"sqlite",description:"SQLite"},{value:"mongodb",description:"MongoDB"},{value:"sqlserver",description:"SQL Server"},{value:"cockroachdb",description:"CockroachDB"}],H=[{value:"prisma-client",description:"Prisma Client"},{value:"prisma-client-js",description:"Legacy Prisma Client JS"}],V=[{value:"51212",description:"Default Studio port"},{value:"5555",description:"Common custom port"},{value:"3000",description:"Alternative port"}],B=[{value:"none",description:"Do not open browser"},{value:"chrome",description:"Google Chrome"},{value:"firefox",description:"Mozilla Firefox"},{value:"safari",description:"Safari"}],U=[{value:"default",description:"Default server name"}],j=[{value:"51213",description:"Default HTTP server port"}],K=[{value:"51214",description:"Default database port"}],Q=[{value:"51215",description:"Default shadow database port"}];var b=class e extends Error{constructor(o){super(o),this.name="HelpError",Object.setPrototypeOf(this,e.prototype)}};var Te=S(Ee());var lt=S(ke(),1);function Y(e,o,t=!0,r=!1){try{return(0,Te.default)(o,{argv:e,stopAtPositional:t,permissive:r})}catch(i){return i}}function J(e){return e instanceof Error}var X={name:"db",description:"Manage your database schema and lifecycle",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"config",description:"Custom path to your Prisma config file",values:a},{name:"schema",description:"Custom path to your Prisma schema",values:l}]};var Z={name:"db execute",description:"Execute SQL or scripts on your database",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"config",description:"Custom path to your Prisma config file",values:a},{name:"file",description:"Path to a file containing the script to execute",values:I},{name:"stdin",description:"Use terminal standard input as the script to execute"}]};var ee={name:"db pull",description:"Pull the schema from an existing database",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"schema",description:"Custom path to your Prisma schema",values:l},{name:"config",description:"Custom path to your Prisma config file",values:a},{name:"url",description:"Override the datasource URL from the Prisma config file",values:g},{name:"force",description:"Ignore current Prisma schema file"},{name:"print",description:"Print the introspected Prisma schema to stdout"},{name:"composite-type-depth",description:"Specify the depth for introspecting composite types",values:M},{name:"schemas",description:"Specify database schemas to introspect (overrides datasource block)",values:W}]};var te={name:"db push",description:"Push the Prisma schema state to the database",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"schema",description:"Custom path to your Prisma schema",values:l},{name:"config",description:"Custom path to your Prisma config file",values:a},{name:"url",description:"Override the datasource URL from the Prisma config file",values:g},{name:"accept-data-loss",description:"Ignore data loss warnings"},{name:"force-reset",description:"Force a reset of the database before push"}]};var oe={name:"db seed",description:"Seed your database",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"schema",description:"Custom path to your Prisma schema",values:l},{name:"config",description:"Custom path to your Prisma config file",values:a}]};var ie={name:"migrate",description:"Migrate your database",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"config",description:"Custom path to your Prisma config file",values:a},{name:"schema",description:"Custom path to your Prisma schema",values:l}]};var re={name:"migrate deploy",description:"Apply pending migrations to the database",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"schema",description:"Custom path to your Prisma schema",values:l},{name:"config",description:"Custom path to your Prisma config file",values:a}]};var ne={name:"migrate dev",description:"Create and apply migrations in development",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"schema",description:"Custom path to your Prisma schema",values:l},{name:"config",description:"Custom path to your Prisma config file",values:a},{name:"url",description:"Override the datasource URL from the Prisma config file",values:g},{name:"name",alias:"n",description:"Name the migration",values:L},{name:"create-only",description:"Create a new migration but do not apply it"}]};var se={name:"migrate diff",description:"Compare the database schema from two arbitrary sources",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"config",description:"Custom path to your Prisma config file",values:a},{name:"output",alias:"o",description:"Write the diff to a file instead of stdout",values:q},{name:"from-empty",description:"Assume the source data model is empty"},{name:"from-schema",description:"Path to a Prisma schema file as the source",values:l},{name:"from-migrations",description:"Path to a Prisma migrations directory as the source",values:E},{name:"from-config-datasource",description:"Use the datasource from the Prisma config file as the source"},{name:"to-empty",description:"Assume the destination data model is empty"},{name:"to-schema",description:"Path to a Prisma schema file as the destination",values:l},{name:"to-migrations",description:"Path to a Prisma migrations directory as the destination",values:E},{name:"to-config-datasource",description:"Use the datasource from the Prisma config file as the destination"},{name:"script",description:"Output a SQL script instead of a human-readable summary"},{name:"exit-code",description:"Change the exit code behavior (Empty=0, Error=1, Not empty=2)"}]};var ae={name:"migrate reset",description:"Reset your database and apply all migrations",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"schema",description:"Custom path to your Prisma schema",values:l},{name:"config",description:"Custom path to your Prisma config file",values:a},{name:"force",alias:"f",description:"Skip the confirmation prompt"}]};var le={name:"migrate resolve",description:"Mark a migration as applied or rolled back",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"schema",description:"Custom path to your Prisma schema",values:l},{name:"config",description:"Custom path to your Prisma config file",values:a},{name:"applied",description:"Mark a migration as applied",values:O},{name:"rolled-back",description:"Mark a migration as rolled back",values:O}]};var me={name:"migrate status",description:"Check the status of your database migrations",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"schema",description:"Custom path to your Prisma schema",values:l},{name:"config",description:"Custom path to your Prisma config file",values:a}]};var Fe=[{name:"nextjs",label:"Next.js"},{name:"express",label:"Express"},{name:"hono",label:"Hono"},{name:"fastify",label:"Fastify"},{name:"nuxt",label:"Nuxt"},{name:"sveltekit",label:"SvelteKit"},{name:"remix",label:"Remix"},{name:"react-router-7",label:"React Router 7"},{name:"astro",label:"Astro"},{name:"nest",label:"NestJS"}];var Ne={name:"bootstrap",description:"Bootstrap a Prisma Postgres project",options:[{name:"api-key",description:"Workspace API key (CI / non-interactive)",values:x},{name:"database",description:"Database ID to link to (e.g. db_abc123)",values:P},{name:"template",description:"Starter template name",values:Fe.map(({name:e,label:o})=>({value:e,description:`${o} starter`}))},{name:"force",description:"Re-link even if already linked to Prisma Postgres"}]};var Ae={name:"debug",description:"Displays Prisma debug info",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"schema",description:"Custom path to your Prisma schema",values:l},{name:"config",description:"Custom path to your Prisma config file",values:a}]};var Re={name:"format",description:"Format your Prisma schema",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"schema",description:"Custom path to your Prisma schema",values:l},{name:"config",description:"Custom path to your Prisma config file",values:a},{name:"check",description:"Check if the schema is formatted"}]};var Ie={name:"generate",description:"Generate artifacts (e.g. Prisma Client)",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"schema",description:"Custom path to your Prisma schema",values:l},{name:"config",description:"Custom path to your Prisma config file",values:a},{name:"watch",description:"Watch the Prisma schema and rerun after a change"},{name:"generator",description:"Generator to use (may be provided multiple times)",values:N},{name:"no-hints",description:"Hides the hint messages but still outputs errors and warnings"},{name:"require-models",description:"Do not allow generating a client without models"},{name:"sql",description:"Generate TypedSQL module"}]};var qe={name:"init",description:"Set up Prisma for your app",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"url",description:"Define a custom datasource url",values:g},{name:"datasource-provider",description:"Define the datasource provider",values:G},{name:"generator-provider",description:"Define the generator provider",values:H},{name:"preview-feature",description:"Define a preview feature to use (can be specified multiple times)",values:R},{name:"output",description:"Define Prisma Client generator output path",values:A},{name:"with-model",description:"Add an example model to the created schema file"},{name:"db",description:"Provision a fully managed Prisma Postgres database on the Prisma Data Platform"}]};var Le={name:"mcp",description:"Starts an MCP server to use with AI development tools",options:[{name:"early-access",description:"Enable early access features"}]};var Me={name:"platform",description:"Prisma Data Platform commands",options:[{name:"help",alias:"h",description:"Display this help message"}],subcommands:[{name:"platform status",description:"Show Prisma Data Platform service status",options:[{name:"help",alias:"h",description:"Display this help message"}]}]};var We={name:"postgres link",description:"Link a local project to a Prisma Postgres database",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"api-key",description:"Workspace API key (CI / non-interactive)",values:x},{name:"database",description:"Database ID to link to (e.g. db_abc123)",values:P},{name:"force",description:"Re-link even if already linked to Prisma Postgres"}]};var Ge={name:"postgres",description:"Manage Prisma Postgres databases",options:[{name:"help",alias:"h",description:"Display this help message"}]};var He={name:"studio",description:"Browse your data with Prisma Studio",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"config",description:"Custom path to your Prisma config file",values:a},{name:"url",description:"Database connection string (overrides the one in your Prisma config file)",values:g},{name:"port",alias:"p",description:"Port to start Studio on",values:V},{name:"browser",alias:"b",description:"Browser to auto-open Studio in",values:B}]};var Ve={name:"validate",description:"Validate your Prisma schema",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"schema",description:"Custom path to your Prisma schema",values:l},{name:"config",description:"Custom path to your Prisma config file",values:a}]};var Be={name:"version",description:"Displays Prisma version info",options:[{name:"help",alias:"h",description:"Display this help message"},{name:"json",description:"Output version information as JSON"}]};var mt={name:"dev",description:"Start a local Prisma Postgres server for development",options:[{name:"name",alias:"n",description:"Name of the server (helps keep state isolated between different projects)",values:U},{name:"port",alias:"p",description:"Main port number for the HTTP server",values:j},{name:"db-port",alias:"P",description:"Port number for the database server",values:K},{name:"shadow-db-port",description:"Port number for the shadow database server",values:Q},{name:"detach",alias:"d",description:"Run the server in the background"},{name:"debug",description:"Enable debug logging"}]},k={name:"debug",description:"Enable debug logging"},pt={name:"dev ls",description:"List available servers",options:[k]},ct={name:"dev rm",description:"Remove servers",options:[k,{name:"force",description:"Stop any running servers before removing them"}]},dt={name:"dev start",description:"Start one or more stopped servers",options:[k]},ut={name:"dev stop",description:"Stop servers",options:[k]},T=["zsh","bash","fish","powershell"],ht={name:"complete",description:"Generate shell completion script",subcommands:T.map(e=>({name:`complete ${e}`,description:`Generate completion script for ${e}`}))},Ue=[qe,Ne,mt,pt,ct,dt,ut,Ie,He,Ve,Re,Be,Ae,Le,Me,Ge,We,ht,X,Z,ee,te,oe,ie,ne,ae,re,me,le,se];function Ke(e){let o=w.command(e.name,e.description);for(let t of e.options??[])ft(o,t);for(let t of e.subcommands??[])Ke(t)}function ft(e,o){if(o.values===void 0){o.alias!==void 0?e.option(o.name,o.description,o.alias):e.option(o.name,o.description);return}e.option(o.name,o.description,t=>{let r=typeof o.values=="function"?o.values():o.values??[];for(let i of r)t(i.value,i.description??"")},o.alias)}function Qe(e,o){if(e[0]==="--"){je();try{return w.parse(e.slice(1)),""}catch(i){return new Error(`Failed to parse completions: ${i}`)}}let t=Y(e,{});if(J(t))return new b(t.message);let r=t._[0];if(r&&T.includes(r)){je();try{return w.setup(o,o,r),""}catch(i){return new Error(`Failed to setup completions: ${i}`)}}return new b(`Invalid shell type. Must be one of: ${T.join(", ")}`)}function je(){for(let e of Ue)Ke(e)}var pe=Qe(process.argv.slice(3),ge());pe instanceof Error?(console.error(pe.message),process.exitCode=1):console.log(pe);
