/* Return number of new infections.

    Parameters:
    from_to (str): transition name consisting of two compartment names
                    separated by an underscore (e.g. S_Ic)
    beta (float): effective contact rate
    compartments (dict): dictionary of compartments including the two
                         specified in from_to
    totals (dict): dictionary containing a key 'N' that is the sum of the
                   total population for this model.
    model (Model): Unused but part of function signature
*/
function delta_S_I(from_to, beta, compartments, totals, model) {
    from_, to_ = from_to.split("_");
    return beta * compartments[from_] * totals[to_] / totals['N']
}

/*
  Return number individuals to be moved from one compartment to another.

  Parameters:
  from_to (str): transition name consisting of two compartment names
  separated by an underscore (e.g. I_R)
  prop (float): proportion of "from" compartment to move
  compartments (dict): dictionary of compartments including the two
  specified in from_to
  totals (dict): Unused but part of function signature
  model (Model): Unused but part of function signature
*/
function delta_X_Y(from_to, prop, compartments, totals, model) {
    from_, _ = from_to.split("_")
    return prop * compartments[from_]
