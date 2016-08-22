package com.adapters;

import android.content.Context;
import android.support.design.widget.Snackbar;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.CheckBox;
import android.widget.TextView;

import com.classes.Ingredient;
import com.oz10.stropping.R;

import java.util.ArrayList;
import java.util.List;

/**
 * Created by Austen on 22/08/2016.
 */
public class IngredientListAdapter extends ArrayAdapter {

    private ArrayList<Ingredient> _ingredientsList = new ArrayList<>();
    public ArrayList<Ingredient> _selectedIngredientsList = new ArrayList<>();

    public IngredientListAdapter(Context context, int resource, List objects) {
        super(context, resource, objects);

        _ingredientsList = (ArrayList<Ingredient>) objects;
    }

    @Override
    public View getView(int position, View convertView, final ViewGroup parent) {

        View view = convertView;

        if (view == null){
            LayoutInflater layoutInflater = LayoutInflater.from(getContext());
            view = layoutInflater.inflate(R.layout.item_ingredient, null);
        }

        final Ingredient ingredient = _ingredientsList.get(position);

        //TODO Refactor
        if (ingredient != null){
            TextView textView = (TextView) view.findViewById(R.id.ingredient_name);
            textView.setOnClickListener(new View.OnClickListener(){
                    @Override
                    public void onClick(View view) {
                        //TODO Open Edit ingredient activity
                        Snackbar snackbar = Snackbar.make(parent, ingredient.getName() + " clicked!", Snackbar.LENGTH_SHORT);
                        snackbar.show();
                    }
                }
            );
            textView.setText(ingredient.getName());

            TextView textView2 = (TextView) view.findViewById(R.id.ingredient_quantity);
            textView2.setOnClickListener(new View.OnClickListener(){
                                            @Override
                                            public void onClick(View view) {
                                                //TODO Open Edit ingredient activity
                                                String quantity = Integer.toString(ingredient.getQuantity());
                                                Snackbar snackbar = Snackbar.make(parent, quantity + " required!", Snackbar.LENGTH_SHORT);
                                                snackbar.show();
                                            }
                                        }
            );
            textView2.setText(ingredient.getQuantityText());

            CheckBox checkBox = (CheckBox) view.findViewById(R.id.ingredient_isselected);
            checkBox.setOnClickListener(new View.OnClickListener(){
                    @Override
                    public void onClick(View view) {
                        CheckBox checkBox = (CheckBox) view.findViewById(R.id.ingredient_isselected);
                        ingredient.setIsSelected(checkBox.isChecked());

                        if (ingredient.getIsSelected()){
                            _selectedIngredientsList.add(ingredient);
                        }else{
                            _selectedIngredientsList.remove(ingredient);
                        }
                    }
                }
            );
            checkBox.setChecked(ingredient.getIsSelected());
        }

        return view;
    }


}
